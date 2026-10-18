<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { assignmentsApi } from '../../api'
import { useAuthStore } from '../../stores/auth'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import TeacherFeedbackEditor from './TeacherFeedbackEditor.vue'
import { reviewQueue } from './review-queue'
import { ApiError } from '../../api/client'
import { pageError } from '../courses/page-error'
import { formatTime } from '../courses/format'
const props = defineProps<{ assignmentId: string }>()
const api = assignmentsApi(), auth=useAuthStore()
const page = ref(1), latestOnly = ref(true)
const feedbackStatus = ref<'' | 'none' | 'draft' | 'published'>('')
const labels = { none: '未批阅', draft: '评价草稿', published: '已发布评价' }
const query = usePageQuery(async signal => (await api.listTeacherSubmissions(props.assignmentId,
  { page: page.value, pageSize: 20, latestOnly: latestOnly.value, ...(feedbackStatus.value ? { feedbackStatus: feedbackStatus.value } : {}) }, { signal })).data)
watch([() => props.assignmentId, latestOnly, feedbackStatus], () => { page.value = 1; void query.load() }, { immediate: true })
watch(page, () => { void query.load() })
const grading=ref(''), queue=ref<string[]>([]), queueTotal=ref(0), queueBusy=ref(false), queueMessage=ref('')
const dialog=ref<HTMLDialogElement|null>(null), editor=ref<InstanceType<typeof TeacherFeedbackEditor>|null>(null)
let controller:AbortController|null=null, trigger:HTMLElement|null=null, generation=0
async function open(id:string) {
  trigger=document.activeElement as HTMLElement
  grading.value=id; queue.value=[]; queueMessage.value=''; queueBusy.value=true
  const current=++generation, userId=auth.identity?.id
  controller?.abort(); controller=new AbortController()
  await nextTick(); dialog.value?.showModal()
  try {
    const ids=await reviewQueue(api,props.assignmentId,feedbackStatus.value,latestOnly.value,id,controller.signal)
    if(current===generation && auth.identity?.id===userId) {queue.value=ids;queueTotal.value=ids.length}
  } catch {
    if(current===generation) queueMessage.value='连续批改队列未能完整加载，仍可保存与发布当前评价；关闭后重试。'
  } finally { if(current===generation) queueBusy.value=false }
}
async function close() {
  generation++; controller?.abort(); dialog.value?.close(); grading.value=''; queue.value=[]
  await query.load(); trigger?.focus()
}
async function next() {
  queue.value=queue.value.filter(id=>id!==grading.value)
  const userId=auth.identity?.id, current=++generation
  while(queue.value.length) {
    const id=queue.value[0]!
    try {
      const result=await api.getSubmission(id)
      if(current!==generation || auth.identity?.id!==userId) return
      if('student' in result.data && !result.data.superseded && result.data.publishedFeedback===null) {
        grading.value=id; await nextTick(); dialog.value?.querySelector<HTMLElement>('.feedback-close')?.focus(); return
      }
      queueMessage.value='已跳过状态发生变化、无法继续批阅的提交。'
    } catch(cause) {
      if(current!==generation || auth.identity?.id!==userId) return
      if(cause instanceof ApiError && (cause.status===404 || cause.status===403)) {
        queueMessage.value='已跳过不再可访问的提交。'; queue.value.shift(); continue
      }
      await pageError(cause)
      queueMessage.value='下一份提交读取失败；队列已暂停。当前已发布结果保留，可关闭后重试。'
      queue.value=[]; return
    }
    queue.value.shift()
  }
  await close()
}
function trap(e:KeyboardEvent) {
  if(e.key!=='Tab') return
  const controls=Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled])')??[]).filter(n=>n.getClientRects().length)
  if(e.shiftKey && document.activeElement===controls[0]) {e.preventDefault();controls.at(-1)?.focus()}
  else if(!e.shiftKey && document.activeElement===controls.at(-1)) {e.preventDefault();controls[0]?.focus()}
}
watch(()=>auth.identity?.id,()=>{generation++;controller?.abort();dialog.value?.close();grading.value='';queue.value=[]})
onBeforeRouteLeave(()=> !grading.value || editor.value?.canLeave() !== false)
onBeforeUnmount(()=>{generation++;controller?.abort();dialog.value?.close()})
</script>
<template>
  <section aria-label="学生提交列表">
    <header class="section-heading"><h2>学生提交</h2><span v-if="query.data.value">共 {{ query.data.value.total }} 份</span></header>
    <div class="submission-toolbar"><label>评价状态<select v-model="feedbackStatus"><option value="">全部</option><option value="none">未批阅</option><option value="draft">评价草稿</option><option value="published">已发布评价</option></select></label><label><input v-model="latestOnly" type="checkbox" />每名学生只显示最新提交</label></div>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value === 'success' && query.data.value">
      <p v-if="!query.data.value.items.length" class="surface state-block">暂无符合条件的提交。</p>
      <div v-else class="submission-table-wrap"><table class="submission-table"><thead><tr><th>学生</th><th>提交时间</th><th>评价状态</th><th>版本</th><th>操作</th></tr></thead><tbody><tr v-for="submission in query.data.value.items" :key="submission.id">
        <td><strong>{{ submission.student.displayName }}</strong><small>{{ submission.student.username }} · 第 {{ submission.attemptNumber }} 次提交</small></td>
        <td>{{ formatTime(submission.submittedAt) }}<small v-if="submission.late">延期提交</small></td>
        <td><span class="tag">{{ labels[submission.feedbackStatus] }}</span><small v-if="submission.superseded">已被新提交替代</small></td>
        <td>{{ submission.workspaceRevision }}</td><td><button class="button secondary" @click="open(submission.id)">查看与批阅</button><RouterLink :to="{name:'teacher-feedback',params:{submissionId:submission.id}}" class="submission-direct">独立打开</RouterLink></td>
      </tr></tbody></table></div>
      <nav class="submission-pagination" aria-label="学生提交分页"><button class="button secondary" :disabled="page <= 1" @click="page--">上一页</button><span>第 {{ page }} 页 · 共 {{ query.data.value.total }} 条</span><button class="button secondary" :disabled="page * 20 >= query.data.value.total" @click="page++">下一页</button></nav>
    </template>
    <dialog ref="dialog" class="feedback-drawer" aria-label="提交批阅" @cancel.prevent="editor?.requestClose()" @keydown="trap">
      <TeacherFeedbackEditor v-if="grading" ref="editor" :key="grading" :submission-id="grading" embedded :queue="queue" :queue-total="queueTotal" :queue-busy="queueBusy" :queue-message="queueMessage" @close="close" @next="next" />
    </dialog>
  </section>
</template>
