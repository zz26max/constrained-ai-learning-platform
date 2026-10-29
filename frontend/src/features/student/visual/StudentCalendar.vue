<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { assignmentsApi, coursesApi, type AssignmentDetailDTO } from '../../../api'
import { allPages } from '../../../api/pagination'
import { useAuthStore } from '../../../stores/auth'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { isUuid, formatTime } from '../../../features/courses/format'
import { addDays, beijingDay, monthDays, shiftMonth, validDay, weekDays } from '../../../features/calendar/dates'
import ApiState from '../../../components/ApiState.vue'
import { deadlineGroups, submissionLabel } from './refinement'
import { beijingTime } from './presentation'

const route=useRoute(), router=useRouter(), auth=useAuthStore(), api=assignmentsApi(), courses=coursesApi()
const today=beijingDay()
const day=computed(()=>validDay(route.query.date)?route.query.date:today)
const view=computed(()=>route.query.view==='week'?'week':'month')
const offeringId=computed(()=>typeof route.query.offering==='string'?route.query.offering:'')
const options=usePageQuery(async signal=>(await allPages(async(page,pageSize,signal)=>(await courses.listMyCourses({page,pageSize,status:'all'},{signal})).data,signal)).map(c=>({id:c.offeringId,title:c.title,groupName:c.groupName})))
const query=usePageQuery(async signal=>{
  const selected=offeringId.value
  if(selected && (!isUuid(selected) || !options.data.value?.some(c=>c.id===selected))) throw new Error('该教学班不在当前可访问范围，请重新选择。')
  const rows=await allPages(async(page,pageSize,signal)=>(await api.listMyAssignments({page,pageSize,filter:'all',...(selected?{offeringId:selected}:{}),...(auth.config?.currentTermId?{termId:auth.config.currentTermId}:{})},{signal})).data,signal)
  return rows.map(a=>({id:a.id,title:a.title,offeringId:a.offeringId,dueAt:a.dueAt,state:a.publicationState,process:'assignmentState' in a ? a.assignmentState : null,course:options.data.value?.find(c=>c.id===a.offeringId)?.title??''}))
})
watch([()=>auth.identity?.id],()=>{void options.load()},{immediate:true})
watch([offeringId,()=>options.data.value,()=>options.status.value],()=>{if(options.status.value==='success') void query.load()},{immediate:true})
function update(patch:Record<string,string>){void router.push({query:{...route.query,...patch}})}
function move(n:number,mobile=false){update({date:mobile||view.value==='week'?addDays(day.value,n*7):shiftMonth(day.value,n)})}
const days=computed(()=>view.value==='month'?monthDays(day.value):weekDays(day.value))
const weekdays=['周一','周二','周三','周四','周五','周六','周日']
const monthLabel=computed(()=>`${day.value.slice(0,4)} 年 ${Number(day.value.slice(5,7))} 月`)
const weekRange=computed(()=>`${weekDays(day.value)[0]?.slice(5)} — ${weekDays(day.value)[6]?.slice(5)}`)
const selectedLabel=computed(()=>`${Number(day.value.slice(5,7))} 月 ${Number(day.value.slice(8))} 日`)
const onDay=(d:string)=>query.data.value?.filter(a=>beijingDay(a.dueAt)===d).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt))??[]
// A date-navigation aid from the complete successful query, not submission eligibility.
const nextScheduled=computed(()=>{
  if(query.status.value!=='success' || onDay(day.value).length)return undefined
  return query.data.value?.filter(a=>a.state==='published' && beijingDay(a.dueAt)>day.value && Date.parse(a.dueAt)>Date.now())
    .sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)||a.id.localeCompare(b.id))[0]
})
const detail=ref<string>(''), dialog=ref<HTMLDialogElement|null>(null)
const active=computed(()=>query.data.value?.find(a=>a.id===detail.value))
async function open(id:string){detail.value=id;await nextTick();dialog.value?.showModal()}
function close(){dialog.value?.close();detail.value=''}
watch(offeringId,close)
onBeforeUnmount(close)
const groupedDay=computed(()=>deadlineGroups(onDay(day.value)))
const eligibility=usePageQuery(async signal=>{
 const tasks=onDay(day.value).filter(a=>a.state!=='archived'),result:Record<string,AssignmentDetailDTO>={};let cursor=0
 await Promise.all(Array.from({length:Math.min(6,tasks.length)},async()=>{
  while(cursor<tasks.length){
   signal.throwIfAborted();const task=tasks[cursor++]!,detail=(await api.getAssignment(task.id,{signal})).data
   if(detail.id!==task.id||detail.offeringId!==task.offeringId||typeof detail.canSubmit!=='boolean')throw new Error('作业提交资格不完整或与当前任务不一致')
   result[task.id]=detail
  }
 }))
 return result
})
watch([day,()=>query.data.value],()=>{if(query.status.value==='success')void eligibility.load()},{immediate:true})
function qualification(id:string){return eligibility.status.value==='loading'?'正在确认提交资格':submissionLabel(eligibility.status.value==='success'?eligibility.data.value?.[id]:undefined)}
const PROCESS_LABELS:Record<string,string>={NOT_STARTED:'未开始',IN_PROGRESS:'进行中',SUBMITTED:'已提交',REVIEWED:'已批改'}
function stateLabel(a:{state:string;process:string|null}){return a.state==='archived'?'已归档':a.process?PROCESS_LABELS[a.process]??'作业截止':'作业截止'}
function eventTone(a:{state:string;process:string|null}){return a.state==='archived'?'archived':a.process==='REVIEWED'?'reviewed':a.process==='SUBMITTED'?'submitted':'open'}
</script>
<template>
 <div class="workspace-page sr-calendar">
  <header class="page-head"><div><h1 class="page-title" tabindex="-1">学习日历</h1><p class="page-summary">作业截止时间 · 北京时间。</p></div><div class="page-actions"><label class="field">教学班<select :value="offeringId" :disabled="options.status.value!=='success'" @change="update({offering:($event.target as HTMLSelectElement).value})"><option value="">当前学期全部课程</option><option v-for="c in options.data.value" :key="c.id" :value="c.id">{{c.title}} · {{c.groupName}}</option></select></label></div></header>
  <ApiState :status="options.status.value" :error="options.error.value" @retry="options.load"/><ApiState :status="query.status.value" :error="query.error.value" @retry="query.load"/>
  <p v-if="query.status.value==='error'" class="notice notice-warn">日程未完整加载，请重试，不将部分结果视为全部日程。</p>
  <template v-if="options.status.value==='success'&&query.status.value==='success'">
   <div class="vx-calendar-toolbar"><div class="vx-month-signature"><h2>{{monthLabel}}</h2><span class="meta">{{view==='month'?'月视图':'周视图 · '+weekRange}}</span></div><div class="vx-month-controls"><button class="button secondary" @click="update({date:today})">今天</button><button class="button secondary" @click="move(-1)">上一{{view==='month'?'月':'周'}}</button><button class="button secondary" @click="move(1)">下一{{view==='month'?'月':'周'}}</button><div class="segmented" aria-label="日历视图"><button :aria-pressed="view==='month'" @click="update({view:'month'})">月</button><button :aria-pressed="view==='week'" @click="update({view:'week'})">周</button></div></div></div>
   <div class="vx-time-grid"><section class="vx-calendar-board" aria-label="作业日历">
    <div class="vx-desktop-calendar"><div class="vx-weekday-labels"><span v-for="w in weekdays" :key="w">{{w}}</span></div><div class="vx-month-grid" :class="{'is-week':view==='week'}"><div v-for="d in days" :key="d" class="vx-day-cell" :class="{outside:d.slice(0,7)!==day.slice(0,7),selected:d===day}"><div class="vx-day-heading"><button class="vx-date-button" :class="{today:d===today}" :aria-current="d===today?'date':undefined" :aria-label="d+'，'+onDay(d).length+'项截止日程'+(d===today?'，今天':'')" :aria-pressed="d===day" @click="update({date:d})">{{Number(d.slice(8))}}</button><span v-if="onDay(d).length" class="vx-day-count">{{onDay(d).length}} 项</span></div><button v-for="a in onDay(d).slice(0,view==='month'?2:undefined)" :key="a.id" class="vx-calendar-chip" :data-tone="eventTone(a)" :title="a.course+' · '+a.title" @click="update({date:d});open(a.id)">{{a.title}}</button><button v-if="view==='month'&&onDay(d).length>2" class="vx-more" @click="update({date:d})">+{{onDay(d).length-2}}</button></div></div></div>
    <div class="vx-mobile-calendar"><div v-if="view==='month'" class="vx-week-controls"><button class="button secondary" @click="move(-1,true)">上一周</button><p aria-live="polite">{{weekRange}}</p><button class="button secondary" @click="move(1,true)">下一周</button></div><div class="vx-week-strip"><button v-for="(d,i) in weekDays(day)" :key="d" class="vx-week-day" :class="{today:d===today}" :aria-current="d===today?'date':undefined" :aria-label="d+'，'+onDay(d).length+'项截止日程'+(d===today?'，今天':'')" :aria-pressed="d===day" @click="update({date:d})"><small>{{weekdays[i]}}</small><strong>{{Number(d.slice(8))}}</strong><span>{{onDay(d).length?onDay(d).length+' 项':'—'}}</span></button></div></div>
   </section>
   <aside class="vx-agenda" aria-label="当日截止安排"><div class="vx-agenda-heading"><div><h2>{{selectedLabel}}</h2><p>{{onDay(day).length}} 项截止日程</p></div></div><ol v-if="onDay(day).length" class="vx-time-groups" aria-label="按截止时刻分组"><li v-for="group in groupedDay" :key="group.key"><header class="vx-deadline-heading"><time :datetime="group.dueAt">{{beijingTime(group.dueAt)}} <span>截止</span></time><span>{{group.items.length}} 项</span></header><ul class="vx-agenda-group-items"><li v-for="a in group.items" :key="a.id"><button class="vx-agenda-event" :data-task-id="a.id" :data-tone="eventTone(a)" @click="open(a.id)"><span class="vx-agenda-course">{{a.course}}</span><strong>{{a.title}}</strong><span class="vx-agenda-meta">{{stateLabel(a)}} <span v-if="a.state!=='archived'" class="vx-eligibility" :role="eligibility.status.value==='loading'?'status':undefined">{{qualification(a.id)}}</span></span></button></li></ul></li></ol><div v-else class="vx-calendar-empty"><h3>当天暂无截止日程</h3><p>选择其他日期查看安排。</p><template v-if="nextScheduled"><h4>下一截止日程</h4><p>{{nextScheduled.title}}</p><p class="meta">{{nextScheduled.course}} · {{formatTime(nextScheduled.dueAt)}}</p><button class="button secondary" @click="update({date:beijingDay(nextScheduled.dueAt)})">查看该日日程 →</button></template></div><p v-if="onDay(day).some(a=>a.state!=='archived')" class="vx-eligibility-note">资格来自作业详情，最终以提交时校验为准。<button v-if="eligibility.status.value==='error'" class="vx-text-action" @click="eligibility.load">重新确认资格 →</button></p></aside>
  </div>
  </template>
  <dialog ref="dialog" class="workspace-dialog calendar-dialog" aria-label="日程详情" @cancel.prevent="close"><template v-if="active"><div class="section-heading"><h2>{{active.title}}</h2><button class="button secondary" @click="close">关闭</button></div><p>{{active.course}}</p><p>状态：{{stateLabel(active)}}</p><p>{{formatTime(active.dueAt)}}</p><p v-if="active.state==='archived'" class="notice notice-info">已归档，历史内容只读。</p><RouterLink class="button primary" :to="{name:'student-assignment',params:{id:active.id}}">查看作业</RouterLink></template></dialog>
 </div>
</template>
