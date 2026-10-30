<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { assignmentsApi, coursesApi } from '../../../api'
import type { AssignmentDetailDTO, AssignmentSummaryDTO } from '../../../api/assignments'
import { allPages } from '../../../api/pagination'
import ApiState from '../../../components/ApiState.vue'
import UiButton from '../../../components/ui/UiButton.vue'
import UiEmptyState from '../../../components/ui/UiEmptyState.vue'
import UiFilterTabs from '../../../components/ui/UiFilterTabs.vue'
import UiNotice from '../../../components/ui/UiNotice.vue'
import UiPager from '../../../components/ui/UiPager.vue'
import IntegratedTaskStatus from './CraftTaskState.vue'
import { assignmentTypeLabel } from '../../../features/assignments/format'
import { taskContentTone } from './content-presentation'
import { deadlineLabel } from '../../../features/assignments/task-presentation'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { byDeadline, matchesTask, taskAction, todoPriority, todoGroupLabel, canEnterWorkspace, type TaskFilter } from '../../../features/assignments/task-presentation'
const route=useRoute(), router=useRouter(), api=assignmentsApi(), courses=coursesApi()
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
const filterTabs=computed(()=>filters.map(f=>({key:f.key,label:f.label,count:scoped.value.filter(t=>matchesTask(t,f.key)).length})))
function setStatusFilter(key:string){change('status',key)}
function goToPage(next:number){void router.push({query:{...route.query,page:String(next)}})}
watch(totalPages,n=>{if(page.value>n)void router.replace({query:{...route.query,page:String(n)}})})
// All todo eligibility is loaded before sorting and slicing, including later API pages.
// Other filters retain their existing current-display-page detail reads.
const eligibilityCandidates=computed(()=>filter.value==='todo'
  ? scoped.value.filter(t=>matchesTask(t,'todo'))
  : scoped.value.filter(t=>matchesTask(t,filter.value)&&t.publicationState!=='archived').sort((a,b)=>(descending.value?-1:1)*byDeadline(a,b)).slice((page.value-1)*PAGE_SIZE,page.value*PAGE_SIZE))
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
// 资格详情以"任务列表快照 + 待办 ID 集合"为加载键：todo 全量预取下，仅页码/排序变化
// 不改变集合与列表时不再重复发起全量 getAssignment；列表重载或集合变化才重新加载。
const eligibilityKey=computed(()=>eligibilityCandidates.value.map(t=>t.id).join('|'))
watch([query.data,eligibilityKey],([data,key],[prevData,prevKey])=>{
  if(query.status.value!=='success')return
  if(data===prevData&&key===prevKey)return
  void details.load()
})
function groupLabel(id:string):string {
  const detail=details.status.value==='success'?details.data.value?.[id]:undefined
  return detail?todoGroupLabel(detail):''
}
function courseName(id:string){return query.data.value?.classes.find(c=>c.offeringId===id)?.title??'课程信息未返回'}
function detailOf(id:string){return details.status.value==='success'?details.data.value?.[id]:undefined}
function typeLabel(type: string | null | undefined) { return assignmentTypeLabel(type) }
// 可继续作答的任务直达工作区；已评价/已提交仍进说明页并带上反馈定位。
function taskEntry(task:AssignmentSummaryDTO){
  return canEnterWorkspace(task,detailOf(task.id))
    ? {name:'student-workspace',params:{id:task.id}}
    : {name:'student-assignment',params:{id:task.id},...(task.publishedFeedbackId?{query:{feedbackId:task.publishedFeedbackId}}:{})}
}
const dayFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric'})
const whenFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false})
function dueDay(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?'无截止':dayFormat.format(date)}
function dueWhen(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?'':whenFormat.format(date)}
</script>
<template>
  <div class="workspace-page sr-tasks student-tasks">
    <header class="page-head">
      <div><h1 class="page-title" tabindex="-1">我的作业</h1><p class="page-summary">截止时间均为北京时间。</p></div>
    </header>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value==='success' && query.data.value">
      <UiFilterTabs :items="filterTabs" :model-value="filter" label="作业状态" @update:model-value="setStatusFilter" />
      <div class="task-toolbar"><label>课程<select :value="offering" @change="change('offering',($event.target as HTMLSelectElement).value)"><option value="">全部课程</option><option v-for="c in query.data.value.classes" :key="c.offeringId" :value="c.offeringId">{{ c.title }} · {{ c.groupName }}</option></select></label><label>排序<select :value="descending?'desc':'asc'" @change="change('sort',($event.target as HTMLSelectElement).value)"><option value="asc">最早截止优先</option><option value="desc">最晚截止优先</option></select></label></div>
      <p v-if="details.status.value==='loading'" role="status" class="meta task-hint">正在确认提交资格…</p>
      <UiNotice v-if="details.status.value==='error'" tone="warn" role="alert"><p>提交资格未能完整加载，当前仅按截止时间排序，可查看详情。</p><UiButton variant="secondary" @click="details.load">重试</UiButton></UiNotice>
      <section class="task-table" aria-label="作业列表">
        <UiEmptyState v-if="!visible.length" title="暂无符合条件的作业" description="调整课程或状态筛选，查看其他任务。"><UiButton variant="secondary" @click="router.push({query:{status:'all'}})">清除筛选</UiButton></UiEmptyState>
        <template v-for="(task,index) in visible" :key="task.id">
        <h2 v-if="filter==='todo' && groupLabel(task.id) && (index===0 || groupLabel(visible[index-1]!.id)!==groupLabel(task.id))" class="task-group-heading" :data-group="groupLabel(task.id)==='可继续处理'?'open':'closed'">{{groupLabel(task.id)}}</h2>
        <article class="task-table-row" :data-task-id="task.id" :data-tone="taskContentTone(task,details.status.value==='success'?details.data.value?.[task.id]:undefined)">
          <div class="t-due">
            <b>{{ dueDay(task.dueAt) }}</b>
            <span class="meta">{{ dueWhen(task.dueAt) }}</span>
            <span v-if="matchesTask(task,'todo')" class="rel" :data-tone="taskContentTone(task,details.status.value==='success'?details.data.value?.[task.id]:undefined)">{{ deadlineLabel(task.dueAt) }}</span>
          </div>
          <div class="t-main vc-task-copy">
            <RouterLink :title="task.title" class="task-title" :to="{name:'student-assignment',params:{id:task.id}}">{{ task.title }}</RouterLink>
            <span class="meta t-meta"><template v-if="typeLabel(task.type)">{{ typeLabel(task.type) }} · </template>{{ courseName(task.offeringId) }}</span>
          </div>
          <IntegratedTaskStatus :show-deadline="false" :task="task" :detail="details.status.value==='success'?details.data.value?.[task.id]:undefined" />
          <RouterLink class="button t-go" :to="taskEntry(task)">{{ taskAction(task,details.status.value==='success'?details.data.value?.[task.id]:undefined) }}</RouterLink>
        </article></template>
      </section>
      <UiPager :page="page" :total="totalPages" label="作业列表分页" :meta="`第 ${page} / ${totalPages} 页 · 共 ${filtered.length} 项`" @update:page="goToPage" />
    </template>
  </div>
</template>
