<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { assignmentsApi, coursesApi, type AssignmentDetailDTO } from '../../../api'
import { allPages } from '../../../api/pagination'
import { useAuthStore } from '../../../stores/auth'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { isUuid, formatTime } from '../../../features/courses/format'
import { addDays, beijingDay, monthDays, shiftMonth, validDay, weekDays } from '../../../features/calendar/dates'
import ApiState from '../../../components/ApiState.vue'
import { assignmentStateLabel } from '../../../features/assignments/format'

const route=useRoute(), router=useRouter(), auth=useAuthStore(), api=assignmentsApi(), courses=coursesApi()
const teacher=computed(()=>route.path.startsWith('/teacher'))
const today=beijingDay()
const day=computed(()=>validDay(route.query.date)?route.query.date:today)
const view=computed(()=>route.query.view==='week'?'week':'month')
const offeringId=computed(()=>typeof route.query.offering==='string'?route.query.offering:'')
const options=usePageQuery(async signal=>teacher.value
  ? (await allPages(async(page,pageSize,signal)=>(await courses.listTeacherOfferings({page,pageSize},{signal})).data,signal)).map(c=>({id:c.id,title:c.title,groupName:c.groupName,mark:c.mark}))
  : (await allPages(async(page,pageSize,signal)=>(await courses.listMyCourses({page,pageSize,status:'all'},{signal})).data,signal)).map(c=>({id:c.offeringId,title:c.title,groupName:c.groupName,mark:c.mark})))
const query=usePageQuery(async signal=>{
  const selected=offeringId.value
  if(selected && (!isUuid(selected) || !options.data.value?.some(c=>c.id===selected))) throw new Error('该教学班不在当前可访问范围，请重新选择。')
  if(teacher.value && !selected) return []
  const rows=teacher.value
    ? await allPages(async(page,pageSize,signal)=>(await api.listTeacherAssignments(selected,{page,pageSize},{signal})).data,signal)
    : await allPages(async(page,pageSize,signal)=>(await api.listMyAssignments({page,pageSize,filter:'all',...(selected?{offeringId:selected}:{}),...(auth.config?.currentTermId?{termId:auth.config.currentTermId}:{})},{signal})).data,signal)
  return rows.filter(a=>a.publicationState!=='draft').map(a=>({id:a.id,title:a.title,offeringId:a.offeringId,dueAt:a.dueAt,state:a.publicationState,process:'assignmentState' in a ? a.assignmentState : null,course:options.data.value?.find(c=>c.id===a.offeringId)?.title??'',courseMark:options.data.value?.find(c=>c.id===a.offeringId)?.mark??''}))
})
watch([teacher,()=>auth.identity?.id],()=>{void options.load()},{immediate:true})
watch([offeringId,()=>options.data.value,()=>options.status.value],()=>{if(options.status.value==='success') void query.load()},{immediate:true})
function update(patch:Record<string,string>){void router.push({query:{...route.query,...patch}})}
function move(n:number,mobile=false){update({date:mobile||view.value==='week'?addDays(day.value,n*7):shiftMonth(day.value,n)})}
const days=computed(()=>view.value==='month'?monthDays(day.value):weekDays(day.value))
const weekdays=['周一','周二','周三','周四','周五','周六','周日']
const onDay=(d:string)=>query.data.value?.filter(a=>beijingDay(a.dueAt)===d).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt))??[]
// A date-navigation aid from the complete successful query, not submission eligibility.
const nextScheduled=computed(()=>{
  if(teacher.value || query.status.value!=='success' || onDay(day.value).length)return undefined
  return query.data.value?.filter(a=>a.state==='published' && beijingDay(a.dueAt)>day.value && Date.parse(a.dueAt)>Date.now())
    .sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)||a.id.localeCompare(b.id))[0]
})
const detail=ref<string>(''), dialog=ref<HTMLDialogElement|null>(null)
const active=computed(()=>query.data.value?.find(a=>a.id===detail.value))
async function open(id:string){detail.value=id;await nextTick();dialog.value?.showModal()}
function close(){dialog.value?.close();detail.value=''}
watch(offeringId,close)
onBeforeUnmount(close)
import {subject,density,beijingTime} from './presentation'
import {deadlineGroups,submissionLabel} from './refinement'
const props=defineProps<{refined?:boolean}>()
const groupedDay=computed(()=>deadlineGroups(onDay(day.value)))
const eligibility=usePageQuery(async signal=>{
 const tasks=onDay(day.value),result:Record<string,AssignmentDetailDTO>={};let cursor=0
 await Promise.all(Array.from({length:Math.min(6,tasks.length)},async()=>{
  while(cursor<tasks.length){
   signal.throwIfAborted();const task=tasks[cursor++]!,detail=(await api.getAssignment(task.id,{signal})).data
   if(detail.id!==task.id||detail.offeringId!==task.offeringId||typeof detail.canSubmit!=='boolean')throw new Error('作业提交资格不完整或与当前任务不一致')
   result[task.id]=detail
  }
 }))
 return result
})
watch([()=>props.refined,day,()=>query.data.value],()=>{if(props.refined&&query.status.value==='success')void eligibility.load()},{immediate:true})
function qualification(id:string){return eligibility.status.value==='loading'?'正在确认提交资格':submissionLabel(eligibility.status.value==='success'?eligibility.data.value?.[id]:undefined)}
</script>
<template><div class="workspace-page vx-page vx-calendar" :class="{'vx-refined':refined}">
 <header class="vx-page-heading"><div><p class="vx-eyebrow">让截止时间，有迹可循 / LEARNING CALENDAR</p><h1 tabindex="-1">学习日历</h1><p class="vx-muted">作业截止安排 · 北京时间</p></div><label>教学班<select :value="offeringId" :disabled="options.status.value!=='success'" @change="update({offering:($event.target as HTMLSelectElement).value})"><option value="">当前学期全部课程</option><option v-for="c in options.data.value" :key="c.id" :value="c.id">{{c.title}} · {{c.groupName}}</option></select></label></header>
 <ApiState :status="options.status.value" :error="options.error.value" @retry="options.load"/><ApiState :status="query.status.value" :error="query.error.value" @retry="query.load"/>
 <p v-if="query.status.value==='error'" class="notice notice-warn">日程未完整加载，请重试，不将部分结果视为全部日程。</p>
 <template v-if="options.status.value==='success'&&query.status.value==='success'">
  <div class="vx-calendar-toolbar"><div class="vx-month-signature"><strong>{{day.slice(5,7)}}</strong><span>{{day.slice(0,4)}} 年<small>{{view==='month'?'月视图':'周视图'}}</small></span><button class="button secondary" @click="update({date:today})">今天</button></div><div class="vx-month-controls"><button class="button secondary" @click="move(-1)">上一{{view==='month'?'月':'周'}}</button><button class="button secondary" @click="move(1)">下一{{view==='month'?'月':'周'}}</button><div class="segmented" aria-label="日历视图"><button :aria-pressed="view==='month'" @click="update({view:'month'})">月</button><button :aria-pressed="view==='week'" @click="update({view:'week'})">周</button></div></div></div>
  <div class="vx-time-grid"><section class="vx-calendar-board" aria-label="作业日历">
   <div v-if="!refined" class="vx-density-key"><span>每日截止数量</span><span><i data-density="one"/>1 项</span><span><i data-density="two"/>2 项</span><span><i data-density="many"/>3 项及以上</span></div>
   <p v-if="refined" class="vx-quantity-note">数字表示截止数量 · 3 项及以上使用淡底提示</p><div class="vx-desktop-calendar"><div class="vx-weekday-labels"><span v-for="w in weekdays" :key="w">{{w}}</span></div><div class="vx-month-grid" :class="{'is-week':view==='week'}"><div v-for="d in days" :key="d" class="vx-day-cell" :class="{outside:d.slice(0,7)!==day.slice(0,7),selected:d===day}" :data-density="density(onDay(d).length)"><div class="vx-day-heading"><button class="vx-date-button" :class="{today:d===today}" :aria-current="refined&&d===today?'date':undefined" :aria-label="d+'，'+onDay(d).length+'项截止日程'+(refined&&d===today?'，今天':'')" :aria-pressed="d===day" @click="update({date:d})">{{Number(d.slice(8))}}</button><span v-if="onDay(d).length">{{onDay(d).length}} 项截止</span><small v-else-if="d===today">今天</small></div><button v-for="a in onDay(d).slice(0,view==='month'?2:undefined)" :key="a.id" class="vx-calendar-chip" :data-family="subject(a.courseMark).family" :title="a.course+' · '+a.title" @click="update({date:d});open(a.id)">{{a.title}}</button><button v-if="view==='month'&&onDay(d).length>2" class="vx-more" @click="update({date:d})">还有 {{onDay(d).length-2}} 项 →</button></div></div></div>
   <div class="vx-mobile-calendar"><div class="vx-week-controls"><button class="button secondary" @click="move(-1,true)">上一周</button><p aria-live="polite">{{weekDays(day)[0]?.slice(5)}} — {{weekDays(day)[6]?.slice(5)}}</p><button class="button secondary" @click="move(1,true)">下一周</button></div><div class="vx-week-strip"><button v-for="(d,i) in weekDays(day)" :key="d" class="vx-week-day" :data-density="density(onDay(d).length)" :class="{today:d===today}" :aria-current="refined&&d===today?'date':undefined" :aria-label="d+'，'+onDay(d).length+'项截止日程'+(refined&&d===today?'，今天':'')" :aria-pressed="d===day" @click="update({date:d})"><small>{{weekdays[i]}}</small><strong>{{Number(d.slice(8))}}</strong><span>{{onDay(d).length?onDay(d).length+'项':'—'}}</span></button></div></div>
  </section>
  <aside class="vx-agenda" aria-label="当日截止安排"><div class="vx-agenda-heading"><strong>{{day.slice(8)}}</strong><div><h2>{{Number(day.slice(5,7))}} 月 {{Number(day.slice(8))}} 日</h2><p>{{onDay(day).length}} 项截止日程</p></div></div><ol v-if="onDay(day).length&&!refined" class="vx-agenda-list"><li v-for="a in onDay(day)" :key="a.id" :data-family="subject(a.courseMark).family"><time :datetime="a.dueAt">{{beijingTime(a.dueAt)}}<small>截止</small></time><button class="vx-agenda-event" @click="open(a.id)"><span class="vx-agenda-course">{{a.course}}</span><strong>{{a.title}}</strong><span class="vx-agenda-meta">{{a.state==='archived'?'已归档 · ':''}}{{a.process==='REVIEWED'?'已批改':a.process?assignmentStateLabel(a.process):'作业截止'}} <span aria-hidden="true">查看详情 ↗</span></span></button></li></ol><ol v-else-if="onDay(day).length&&refined" class="vx-time-groups" aria-label="按截止时刻分组"><li v-for="group in groupedDay" :key="group.key"><header class="vx-deadline-heading"><time :datetime="group.dueAt">{{beijingTime(group.dueAt)}} <span>截止</span></time><span>{{group.items.length}} 项任务</span></header><ul class="vx-agenda-group-items"><li v-for="a in group.items" :key="a.id" :data-family="subject(a.courseMark).family"><button class="vx-agenda-event" :data-task-id="a.id" @click="open(a.id)"><span class="vx-agenda-course">{{a.course}}</span><strong>{{a.title}}</strong><span class="vx-agenda-meta">{{a.state==='archived'?'已归档 · ':''}}{{a.process==='REVIEWED'?'已批改':a.process?assignmentStateLabel(a.process):'作业截止'}} <span class="vx-eligibility" :role="eligibility.status.value==='loading'?'status':undefined">{{qualification(a.id)}}</span><span aria-hidden="true">查看详情 ↗</span></span></button></li></ul></li></ol><div v-else class="vx-calendar-empty"><span aria-hidden="true">—</span><h3>这一天，暂无截止安排。</h3><p>当天暂无截止日程。选择其他日期查看安排。</p><template v-if="nextScheduled"><h4>下一截止日程</h4><p>{{nextScheduled.title}}</p><p class="vx-muted">{{nextScheduled.course}} · {{formatTime(nextScheduled.dueAt)}}</p><button class="button secondary" @click="update({date:beijingDay(nextScheduled.dueAt)})">查看该日日程 →</button></template></div><p v-if="refined&&onDay(day).length" class="vx-eligibility-note">资格来自作业详情，最终以提交时校验为准。<button v-if="eligibility.status.value==='error'" class="vx-text-action" @click="eligibility.load">重新确认资格 →</button></p></aside>
  </div>
 </template>
 <dialog ref="dialog" class="workspace-dialog calendar-dialog" aria-label="日程详情" @cancel.prevent="close"><template v-if="active"><div class="section-heading"><h2>{{active.title}}</h2><button class="button secondary" @click="close">关闭</button></div><p>{{active.course}}</p><p v-if="active.process">处理状态：{{active.process==='REVIEWED'?'已批改':assignmentStateLabel(active.process)}}</p><p>{{formatTime(active.dueAt)}}</p><p v-if="active.state==='archived'" class="notice notice-info">已归档，历史内容只读。</p><RouterLink class="button primary" :to="{name:'student-assignment',params:{id:active.id}}">查看作业</RouterLink></template></dialog>
</div></template>
