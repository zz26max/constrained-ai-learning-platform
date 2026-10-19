<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { assignmentsApi, coursesApi } from '../../api'
import { allPages } from '../../api/pagination'
import { useAuthStore } from '../../stores/auth'
import { usePageQuery } from '../courses/use-page-query'
import { isUuid, formatTime } from '../courses/format'
import { addDays, beijingDay, monthDays, shiftMonth, validDay, weekDays } from './dates'
import ApiState from '../../components/ApiState.vue'
import { assignmentStateLabel } from '../assignments/format'

const route=useRoute(), router=useRouter(), auth=useAuthStore(), api=assignmentsApi(), courses=coursesApi()
const teacher=computed(()=>route.path.startsWith('/teacher'))
const today=beijingDay()
const day=computed(()=>validDay(route.query.date)?route.query.date:today)
const view=computed(()=>route.query.view==='week'?'week':'month')
const offeringId=computed(()=>typeof route.query.offering==='string'?route.query.offering:'')
const options=usePageQuery(async signal=>teacher.value
  ? (await allPages(async(page,pageSize,signal)=>(await courses.listTeacherOfferings({page,pageSize},{signal})).data,signal)).map(c=>({id:c.id,title:c.title,groupName:c.groupName}))
  : (await allPages(async(page,pageSize,signal)=>(await courses.listMyCourses({page,pageSize,status:'all'},{signal})).data,signal)).map(c=>({id:c.offeringId,title:c.title,groupName:c.groupName})))
const query=usePageQuery(async signal=>{
  const selected=offeringId.value
  if(selected && (!isUuid(selected) || !options.data.value?.some(c=>c.id===selected))) throw new Error('该教学班不在当前可访问范围，请重新选择。')
  if(teacher.value && !selected) return []
  const rows=teacher.value
    ? await allPages(async(page,pageSize,signal)=>(await api.listTeacherAssignments(selected,{page,pageSize},{signal})).data,signal)
    : await allPages(async(page,pageSize,signal)=>(await api.listMyAssignments({page,pageSize,filter:'all',...(selected?{offeringId:selected}:{}),...(auth.config?.currentTermId?{termId:auth.config.currentTermId}:{})},{signal})).data,signal)
  return rows.filter(a=>a.publicationState!=='draft').map(a=>({id:a.id,title:a.title,offeringId:a.offeringId,dueAt:a.dueAt,state:a.publicationState,process:'assignmentState' in a ? a.assignmentState : null,course:options.data.value?.find(c=>c.id===a.offeringId)?.title??''}))
})
watch([teacher,()=>auth.identity?.id],()=>{void options.load()},{immediate:true})
watch([offeringId,()=>options.data.value,()=>options.status.value],()=>{if(options.status.value==='success') void query.load()},{immediate:true})
function update(patch:Record<string,string>){void router.push({query:{...route.query,...patch}})}
function move(n:number,mobile=false){update({date:mobile||view.value==='week'?addDays(day.value,n*7):shiftMonth(day.value,n)})}
const days=computed(()=>view.value==='month'?monthDays(day.value):weekDays(day.value))
const weekdays=['周一','周二','周三','周四','周五','周六','周日']
const onDay=(d:string)=>query.data.value?.filter(a=>beijingDay(a.dueAt)===d).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt))??[]
const detail=ref<string>(''), dialog=ref<HTMLDialogElement|null>(null)
const active=computed(()=>query.data.value?.find(a=>a.id===detail.value))
async function open(id:string){detail.value=id;await nextTick();dialog.value?.showModal()}
function close(){dialog.value?.close();detail.value=''}
watch(offeringId,close)
onBeforeUnmount(close)
</script>
<template>
  <div class="workspace-page">
    <header class="workspace-heading"><div><h1 tabindex="-1">{{teacher?'教学日历':'学习日历'}}</h1><p>作业截止时间 · 北京时间</p></div></header>
    <div class="toolbar"><label>教学班<select :value="offeringId" :disabled="options.status.value!=='success'" @change="update({offering:($event.target as HTMLSelectElement).value})"><option value="">{{teacher?'请选择教学班':'当前学期全部课程'}}</option><option v-for="c in options.data.value" :key="c.id" :value="c.id">{{c.title}} · {{c.groupName}}</option></select></label></div>
    <ApiState :status="options.status.value" :error="options.error.value" @retry="options.load" />
    <p v-if="teacher&&!offeringId&&options.status.value==='success'" class="surface state-block">选择一个教学班，查看完整作业截止日程。</p>
    <template v-else-if="options.status.value==='success'">
      <p v-if="query.status.value==='error'" class="notice notice-warn">日程未完整加载，请重试。当前不将部分数据视为全部日程。</p>
      <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
      <template v-if="query.status.value==='success'">
        <div class="calendar-toolbar"><div class="calendar-controls"><h2 aria-live="polite">{{day.slice(0,4)}} 年 {{Number(day.slice(5,7))}} 月</h2><button class="button secondary" @click="update({date:today})">今天</button></div><div class="calendar-controls calendar-desktop-controls"><button class="button secondary" @click="move(-1)">上一{{view==='month'?'月':'周'}}</button><button class="button secondary" @click="move(1)">下一{{view==='month'?'月':'周'}}</button><div class="segmented" aria-label="日历视图"><button :aria-pressed="view==='month'" @click="update({view:'month'})">月</button><button :aria-pressed="view==='week'" @click="update({view:'week'})">周</button></div></div></div>
        <div class="calendar-layout"><section class="surface calendar-board" aria-label="作业日历">
          <div class="calendar-desktop"><div class="calendar-weekdays"><span v-for="w in weekdays" :key="w">{{w}}</span></div><div class="calendar-grid" :class="{'calendar-week-grid':view==='week'}"><div v-for="d in days" :key="d" class="calendar-cell" :class="{outside:d.slice(0,7)!==day.slice(0,7),selected:d===day}"><button class="calendar-day-number" :class="{today:d===today}" :aria-label="d+' 日程'" :aria-pressed="d===day" @click="update({date:d})">{{Number(d.slice(8))}}</button><button v-for="a in onDay(d).slice(0,view==='month'?2:undefined)" :key="a.id" class="calendar-chip" :title="a.title" @click="update({date:d});open(a.id)"><span>{{a.state==='archived'?'归档':'截止'}}</span> {{a.title}}</button><button v-if="view==='month'&&onDay(d).length>2" class="calendar-more" @click="update({date:d})">还有 {{onDay(d).length-2}} 项</button></div></div></div>
          <div class="calendar-mobile"><div class="calendar-controls between"><button class="button secondary" @click="move(-1,true)">上一周</button><button class="button secondary" @click="move(1,true)">下一周</button></div><div class="calendar-week-strip"><button v-for="(d,i) in weekDays(day)" :key="d" class="calendar-day-number" :class="{today:d===today}" :aria-label="d+' 日程'" :aria-pressed="d===day" @click="update({date:d})"><small>{{weekdays[i]}}</small><span>{{Number(d.slice(8))}}</span><i v-if="onDay(d).length" /></button></div></div>
        </section><aside class="surface calendar-agenda"><h2>{{Number(day.slice(5,7))}} 月 {{Number(day.slice(8))}} 日</h2><p class="muted">{{onDay(day).length}} 项截止日程</p><button v-for="a in onDay(day)" :key="a.id" class="agenda-event" @click="open(a.id)"><span class="tag">{{a.state==='archived'?'已归档':'作业截止'}}</span><strong>{{a.title}}</strong><span v-if="a.process" class="tag">{{a.process==='REVIEWED'?'✓ 已批改':assignmentStateLabel(a.process)}}</span><small>{{a.course}}</small><small>{{formatTime(a.dueAt)}}</small></button><div v-if="!onDay(day).length" class="calendar-empty"><h3>当天暂无截止日程</h3><p class="muted">选择其他日期查看作业安排。</p></div></aside></div>
      </template>
    </template>
    <dialog ref="dialog" class="workspace-dialog calendar-dialog" aria-label="日程详情" @cancel.prevent="close"><template v-if="active"><div class="section-heading"><h2>{{active.title}}</h2><button class="button secondary" @click="close">关闭</button></div><p>{{active.course}}</p><p v-if="active.process">处理状态：{{active.process==='REVIEWED'?'已批改':assignmentStateLabel(active.process)}}</p><p>{{formatTime(active.dueAt)}}</p><p v-if="active.state==='archived'" class="notice notice-info">已归档，历史内容只读。</p><RouterLink class="button primary" :to="{name:teacher?'teacher-assignment':'student-assignment',params:{id:active.id}}">查看作业</RouterLink></template></dialog>
  </div>
</template>
