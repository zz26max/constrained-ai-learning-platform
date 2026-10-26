import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { dashboardApi, assignmentsApi, coursesApi } from '../../api'
import { allPages } from '../../api/pagination'
import type { AssignmentDetailDTO } from '../../api/assignments'
import { byDeadline, byRecentStudy } from '../assignments/task-presentation'
import { usePageQuery } from '../courses/use-page-query'
import { useOpenTarget } from '../notifications/use-open-target'
import { useNotificationsStore } from '../../stores/notifications'

export function useStudentHome() {
const route = useRoute()
const api = dashboardApi()
const target = useOpenTarget()
// 看板已返回未读消息数：作为快照写入外壳徽标。快照携带发起时版本号，
// 若期间消息页已有更新的服务器确认（refresh），迟到的 dashboard 响应不会回退徽标。
const badges = useNotificationsStore()
let dashboardSnapshotSeq = 0
const query = usePageQuery(async signal => {
  dashboardSnapshotSeq = badges.snapshotSeq()
  return (await api.getDashboard({}, { signal })).data
})
watch(() => route.path, () => { void query.load() }, { immediate: true })
watch(() => query.data.value?.unreadMessageCount, value => {
  if (typeof value === 'number') badges.setUnread(value, dashboardSnapshotSeq)
})

const TYPE_LABELS = { web_lab: '网页实验', sql_text: 'SQL 作业', text: '文本作业' } as const

function excerpt(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** 首页优先完整待办中经服务端确认仍可提交的任务。 */
const tasksApi=assignmentsApi(), courses=coursesApi()
const tasksQuery=usePageQuery(async signal=>{
  const [tasks,classes]=await Promise.all([
    allPages((page,pageSize,signal)=>tasksApi.listMyAssignments({filter:'todo',page,pageSize},{signal}).then(r=>r.data),signal),
    allPages((page,pageSize,signal)=>courses.listMyCourses({status:'all',page,pageSize},{signal}).then(r=>r.data),signal),
  ])
  const actionable: AssignmentDetailDTO[]=[]
  for(const task of tasks.sort(byDeadline)){
    if(task.publicationState==='archived'||task.offeringStatus==='archived')continue
    const detail=(await tasksApi.getAssignment(task.id,{signal})).data
    if(detail.canSubmit){actionable.push(detail);if(actionable.length===6)break}
  }
  return {actionable,classes:classes.sort(byRecentStudy)}
})
watch(()=>route.path,()=>{void tasksQuery.load()},{immediate:true})
const nextTask=computed(()=>tasksQuery.data.value?.actionable[0])
const recentTasks=computed(()=>tasksQuery.data.value?.actionable.slice(1,6)??[])
const recentCourse=computed(()=>tasksQuery.data.value?.classes.find(c=>c.status==='active'&&c.currentChapter))
function courseName(id:string){return tasksQuery.data.value?.classes.find(c=>c.offeringId===id)?.title??'课程信息未返回'}

return {query,tasksQuery,target,nextTask,recentTasks,recentCourse,courseName,TYPE_LABELS,excerpt}
}
export type StudentHomeState = ReturnType<typeof useStudentHome>
