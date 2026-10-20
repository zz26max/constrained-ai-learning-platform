<script setup lang="ts">

import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { assignmentsApi, coursesApi } from '../../../api'
import type { AssignmentDetailDTO } from '../../../api/assignments'
import { allPages } from '../../../api/pagination'
import ApiState from '../../../components/ApiState.vue'
import IntegratedTaskStatus from './CraftTaskState.vue'
import SubjectIdentity from './SubjectIdentity.vue'
import CraftDate from './CraftDate.vue'
import {deadlineLabel} from '../../../features/assignments/task-presentation'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { formatTime } from '../../../features/courses/format'
import { byDeadline, matchesTask, taskAction, todoPriority, todoGroupLabel, type TaskFilter } from '../../../features/assignments/task-presentation'
const route=useRoute(), router=useRouter(), api=assignmentsApi(), courses=coursesApi()
const direction='b'
const PAGE_SIZE=20
const filters: {key:TaskFilter;label:string}[]=[{key:'todo',label:'待完成'},{key:'submitted',label:'已提交'},{key:'reviewed',label:'已批改'},{key:'all',label:'全部'}]
const filter=computed<TaskFilter>(()=>filters.some(f=>f.key===route.query.status) ? route.query.status as TaskFilter : 'todo')
const offering=computed(()=>typeof route.query.offering==='string'?route.query.offering:'')
const descending=computed(()=>route.query.sort==='desc')
const page=computed(()=>{const n=Number(route.query.page);return Number.isSafeInteger(n)&&n>0?n:1})
const query=usePageQuery(async signal=>{
  const [tasks,classes]=await Promise.all([
    allPages((page,pageSize,signal)=>api.listMyAssignments({page,pageSize,filter:'all'}, {signal}).then(r=>r.data),signal),
    allPages((page,pageSize,signal)=>courses.listMyCourses({page,pageSize,status:'all'},{signal}).then(r=>r.data),signal),
  ])
  return {tasks,classes}
})
watch(()=>route.path,()=>{void query.load()},{immediate:true})
const scoped=computed(()=>(query.data.value?.tasks??[]).filter(t=>!offering.value||t.offeringId===offering.value))
const filtered=computed(()=>scoped.value.filter(t=>matchesTask(t,filter.value)).sort((a,b)=>{
  if(filter.value==='todo' && details.status.value==='success'){
    const left=details.data.value?.[a.id],right=details.data.value?.[b.id]
    if(left&&right){const rank=todoPriority(left)-todoPriority(right);if(rank)return rank}
  }
  return (descending.value?-1:1)*byDeadline(a,b)
}))
const totalPages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/PAGE_SIZE)))
const visible=computed(()=>filtered.value.slice((page.value-1)*PAGE_SIZE,page.value*PAGE_SIZE))
function change(key:string,value:string){void router.push({query:{...route.query,[key]:value,page:'1'}})}
watch(totalPages,n=>{if(page.value>n)void router.replace({query:{...route.query,page:String(n)}})})
// All todo eligibility is loaded before sorting and slicing, including later API pages.
// Other filters retain their existing current-display-page detail reads.
const eligibilityCandidates=computed(()=>filter.value==='todo'
  ? scoped.value.filter(t=>matchesTask(t,'todo'))
  : scoped.value.filter(t=>matchesTask(t,filter.value)).sort((a,b)=>(descending.value?-1:1)*byDeadline(a,b)).slice((page.value-1)*PAGE_SIZE,page.value*PAGE_SIZE))
const details=usePageQuery(async signal=>{
  const tasks=eligibilityCandidates.value
  const result:Record<string, AssignmentDetailDTO>={}
  let cursor=0
  await Promise.all(Array.from({length:Math.min(6,tasks.length)},async()=>{
    while(cursor<tasks.length){
      signal.throwIfAborted()
      const task=tasks[cursor++]!
      const detail=(await api.getAssignment(task.id,{signal})).data
      if(detail.canSubmit===null)throw new Error('未返回学生提交资格')
      if(detail.id!==task.id || detail.offeringId!==task.offeringId || typeof detail.canSubmit!=='boolean')throw new Error('作业提交资格不完整或与当前任务不一致')
      result[task.id]=detail
    }
  }))
  return result
})
watch(eligibilityCandidates,()=>{if(query.status.value==='success')void details.load()})
function groupLabel(id:string):string {
  const detail=details.status.value==='success'?details.data.value?.[id]:undefined
  return detail?todoGroupLabel(detail):''
}
function courseName(id:string){return query.data.value?.classes.find(c=>c.offeringId===id)?.title??'课程信息未返回'}
</script>
<template>
  <div class="workspace-page vx-page v35-page vc-page vc-tasks student-tasks" :data-craft="direction" :data-polish="true" data-unread="a">
    <header class="workspace-heading"><div><h1 tabindex="-1">我的作业</h1><p>先处理待完成任务，截止时间均为北京时间。</p></div></header>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value==='success' && query.data.value">
      <nav class="filter-tabs" aria-label="作业状态"><button v-for="f in filters" :key="f.key" :aria-pressed="filter===f.key" @click="change('status',f.key)">{{ f.label }} <span>{{ scoped.filter(t=>matchesTask(t,f.key)).length }}</span></button></nav>
      <div class="task-toolbar"><label>课程<select :value="offering" @change="change('offering',($event.target as HTMLSelectElement).value)"><option value="">全部课程</option><option v-for="c in query.data.value.classes" :key="c.offeringId" :value="c.offeringId">{{ c.title }} · {{ c.groupName }}</option></select></label><label>排序<select :value="descending?'desc':'asc'" @change="change('sort',($event.target as HTMLSelectElement).value)"><option value="asc">最早截止优先</option><option value="desc">最晚截止优先</option></select></label><span class="muted">{{ filtered.length }} 项作业<span v-if="filter==='todo' && details.status.value==='success'">可处理优先，组内按截止时间排序</span></span></div>
      <p v-if="details.status.value==='loading'" role="status" class="muted">正在确认提交资格…</p>
      <p v-if="details.status.value==='error'" role="alert">提交资格未能完整加载，当前仅按截止时间排序，可查看详情。<button class="button secondary" @click="details.load">重试</button></p>
      <section class="surface task-table" aria-label="作业列表">
        <div class="task-table-head" aria-hidden="true"><span>作业与课程</span><span>截止安排</span><span>作答状态</span><span>下一步</span></div>
        <div v-if="!visible.length" class="empty-state"><h2>暂无符合条件的作业</h2><p>调整课程或状态筛选，查看其他任务。</p><button class="button secondary" @click="router.push({query:{status:'all'}})">清除筛选</button></div>
        <template v-for="(task,index) in visible" :key="task.id">
        <h2 v-if="filter==='todo' && groupLabel(task.id) && (index===0 || groupLabel(visible[index-1]!.id)!==groupLabel(task.id))" class="task-group-heading">{{groupLabel(task.id)}}</h2>
        <article class="task-table-row" :data-task-id="task.id">
          <div class="vc-task-copy"><RouterLink :title="task.title" class="task-title" :to="{name:'student-assignment',params:{id:task.id}}">{{ task.title }}</RouterLink><div class="task-course"><SubjectIdentity :course="query.data.value.classes.find(c=>c.offeringId===task.offeringId)" /></div></div>
          <div class="vc-task-date"><CraftDate :value="task.dueAt"/><span class="vc-due-state">{{deadlineLabel(task.dueAt)}}</span></div>
          <IntegratedTaskStatus :show-deadline="false" :task="task" :detail="details.status.value==='success'?details.data.value?.[task.id]:undefined" />
          <RouterLink class="button secondary" :to="{name:'student-assignment',params:{id:task.id},query:task.publishedFeedbackId?{feedbackId:task.publishedFeedbackId}:{}}">{{ taskAction(task,details.status.value==='success'?details.data.value?.[task.id]:undefined) }}</RouterLink>
        </article></template>
      </section>
      <nav v-if="totalPages>1" class="pagination" aria-label="作业列表分页"><button class="button secondary" :disabled="page<=1" @click="router.push({query:{...route.query,page:String(page-1)}})">上一页</button><span>第 {{ page }} / {{ totalPages }} 页</span><button class="button secondary" :disabled="page>=totalPages" @click="router.push({query:{...route.query,page:String(page+1)}})">下一页</button></nav>
    </template>
  </div>
</template>
