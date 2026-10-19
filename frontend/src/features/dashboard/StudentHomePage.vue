<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { dashboardApi, assignmentsApi, coursesApi } from '../../api'
import { allPages } from '../../api/pagination'
import type { AssignmentDetailDTO } from '../../api/assignments'
import TaskStatus from '../../components/TaskStatus.vue'
import { byDeadline, byRecentStudy, taskAction } from '../assignments/task-presentation'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatTime } from '../courses/format'
import { useOpenTarget } from '../notifications/use-open-target'

const route = useRoute()
const api = dashboardApi()
const target = useOpenTarget()
const query = usePageQuery(async signal => (await api.getDashboard({}, { signal })).data)
watch(() => route.fullPath, () => { void query.load() }, { immediate: true })

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
watch(()=>route.fullPath,()=>{void tasksQuery.load()},{immediate:true})
const nextTask=computed(()=>tasksQuery.data.value?.actionable[0])
const recentTasks=computed(()=>tasksQuery.data.value?.actionable.slice(1,6)??[])
const recentCourse=computed(()=>tasksQuery.data.value?.classes.find(c=>c.status==='active'&&c.currentChapter))
function courseName(id:string){return tasksQuery.data.value?.classes.find(c=>c.offeringId===id)?.title??'课程信息未返回'}
</script>

<template>
  <div class="workspace-page dashboard-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">学习首页</h1>
        <p v-if="query.status.value === 'success' && query.data.value">
          {{ query.data.value.termId === null ? '当前没有进行中的学期' : query.data.value.termLabel }}
        </p>
      </div>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <template v-if="query.status.value === 'success' && query.data.value">
      <p class="today-summary">本学期待完成 {{ query.data.value.pendingAssignmentCount }} 项 · 优先处理仍可提交的任务</p>
      <div class="dashboard-content"><div class="dashboard-primary">
      <section class="surface dash-section current-task" aria-labelledby="dash-current">
        <h2 id="dash-current">接下来要做</h2>
        <ApiState :status="tasksQuery.status.value" :error="tasksQuery.error.value" @retry="tasksQuery.load" />
        <template v-if="tasksQuery.status.value==='success'">
          <template v-if="nextTask">
            <h3 class="dash-wrap">{{ nextTask.title }}</h3>
            <p v-if="nextTask.title.includes('�')" class="notice-error">原始标题存在乱码，请联系教师修正；作业仍可按原链接访问。</p>
            <p class="muted">{{ courseName(nextTask.offeringId) }} · {{ TYPE_LABELS[nextTask.type] }}</p>
            <p class="muted">截止于 {{ formatTime(nextTask.dueAt) }}（北京时间）</p>
            <TaskStatus :task="nextTask" :detail="nextTask" />
            <div class="task-actions"><RouterLink class="button primary" :to="{name:'student-assignment',params:{id:nextTask.id}}">{{ taskAction(nextTask,nextTask) }}</RouterLink><RouterLink to="/student/assignments">查看全部待办</RouterLink></div>
          </template>
          <template v-else><h3>当前没有可提交的待办</h3><p class="muted">可以继续课程学习，或查看已截止任务与历史提交。</p><RouterLink class="button primary" :to="recentCourse?.currentChapter?{name:'chapter',params:{offeringId:recentCourse.offeringId,chapterId:recentCourse.currentChapter.id}}:'/course'">{{ recentCourse?'继续最近的课程':'查看我的课程' }}</RouterLink><RouterLink class="task-secondary-link" to="/student/assignments">查看全部待办</RouterLink></template>
        </template>
      </section>
      <section class="surface dash-section" aria-labelledby="dash-others">
        <header class="section-heading"><h2 id="dash-others">近期任务</h2><RouterLink to="/student/assignments">全部作业</RouterLink></header>
        <p v-if="tasksQuery.status.value==='error'" class="muted">任务尚未完整加载，请在上方重试。</p>
        <ul v-else-if="recentTasks.length" class="upcoming-tasks"><li v-for="task in recentTasks" :key="task.id"><div><RouterLink class="task-title" :to="{name:'student-assignment',params:{id:task.id}}">{{ task.title }}</RouterLink><p class="muted">{{ courseName(task.offeringId) }} · {{ formatTime(task.dueAt) }}</p><TaskStatus :task="task" :detail="task" /></div><RouterLink class="button secondary" :to="{name:'student-assignment',params:{id:task.id}}">{{ taskAction(task,task) }}</RouterLink></li></ul>
        <p v-else-if="tasksQuery.status.value==='success'" class="muted">没有更多可提交的近期任务。已截止任务仍可在全部作业中查看。</p>
      </section>
      <section v-if="tasksQuery.status.value==='success'" class="surface dash-section" aria-labelledby="dash-courses">
        <header class="section-heading">
          <h2 id="dash-courses">继续学习</h2>
          <RouterLink  to="/course">查看全部课程</RouterLink>
        </header>
        <p v-if="!tasksQuery.data.value?.classes.length" class="dash-meta">本学期暂无课程</p>
        <ul v-else class="dash-courses">
          <li v-for="course in tasksQuery.data.value?.classes.slice(0,2)" :key="course.offeringId" class="dash-course">
            <h3 class="dash-wrap"><RouterLink :to="{ name: 'course', params: { offeringId: course.offeringId } }">{{ course.title }}</RouterLink></h3>
            <p class="dash-meta dash-wrap">{{ course.groupName }} · {{ course.teachers.map(t => t.displayName).join('、') }}</p>
            <p v-if="course.progress.notConfigured" class="dash-meta">未配置学习内容</p>
            <div v-else class="course-progress"><span>{{course.progress.unit==='chapter'?'章节进度':'作业进度'}}</span>
              <div class="progress-track" role="progressbar" :aria-label="course.title + '进度'" :aria-valuenow="course.progress.percent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: course.progress.percent + '%' }" /></div>
              <span>{{ course.progress.completed }}/{{ course.progress.total }} <strong>{{ course.progress.percent }}%</strong></span>
            </div>
            <p v-if="course.pendingAssignmentCount > 0 || course.unreadFeedbackCount > 0" class="dash-badges">
              <span v-if="course.pendingAssignmentCount > 0" class="tag">{{ course.pendingAssignmentCount }} 项待办</span>
              <span v-if="course.unreadFeedbackCount > 0" class="tag">{{ course.unreadFeedbackCount }} 条未读反馈</span>
            </p>
            <p v-if="course.currentChapter" class="muted">最近阅读：{{course.currentChapter.title}}</p><p class="dash-links"><RouterLink class="button secondary" :to="course.currentChapter && course.progress.percent<100 && course.status==='active' ? {name:'chapter',params:{offeringId:course.offeringId,chapterId:course.currentChapter.id}} : {name:'course',params:{offeringId:course.offeringId}}">{{course.progress.percent===100||course.status==='archived'?'查看课程':'继续学习'}}</RouterLink>
              <RouterLink :to="{ name: 'student-progress', params: { offeringId: course.offeringId } }">学习记录</RouterLink>
              <RouterLink :to="{ name: 'student-notices', params: { offeringId: course.offeringId } }">公告</RouterLink>
            </p>
          </li>
        </ul>
      </section>


      </div><aside class="dashboard-secondary"><section class="surface dash-section" aria-labelledby="dash-feedback">
        <h2 id="dash-feedback">最近反馈</h2>
        <template v-if="query.data.value.recentFeedback">
          <p class="dash-feedback-head">
            <RouterLink class="dash-wrap" :to="{ name: 'student-assignment', params: { id: query.data.value.recentFeedback.assignmentId }, query: { feedbackId: query.data.value.recentFeedback.id } }">{{ query.data.value.recentFeedback.assignmentTitle }}</RouterLink>
            <span class="dash-meta">{{ formatTime(query.data.value.recentFeedback.publishedAt) }} · {{ query.data.value.recentFeedback.score }}/{{ query.data.value.recentFeedback.maxScore }}</span>
          </p>
          <p class="dash-text">{{ excerpt(query.data.value.recentFeedback.comment) }}</p>
        </template>
        <p v-else class="dash-meta">暂无已发布的评价</p>
      </section>

      <section class="surface dash-section" aria-labelledby="dash-notice">
        <h2 id="dash-notice">最新公告</h2>
        <ActionNotice :error="target.error.value" :message="null" />
        <template v-if="query.data.value.recentNotice">
          <p class="dash-wrap">
            <button v-if="target.canOpen(query.data.value.recentNotice.target)" type="button" class="button secondary" @click="target.open(query.data.value.recentNotice.target)">{{ query.data.value.recentNotice.title }}</button>
            <RouterLink v-else to="/student/messages">{{ query.data.value.recentNotice.title }}</RouterLink>
            <span v-if="query.data.value.recentNotice.readAt === null" class="tag">未读</span>
          </p>
          <p class="dash-meta">
            {{ query.data.value.recentNotice.sender?.displayName ?? '系统' }} · {{ formatTime(query.data.value.recentNotice.createdAt) }}
          </p>
        </template>
        <p v-else class="dash-meta">暂无公告</p>
      </section></aside></div>
      <ul class="dash-summary home-summary" aria-label="学习概览"><li><strong>{{ query.data.value.courseCount }}</strong> 门课程</li><li><strong>{{ query.data.value.pendingAssignmentCount }}</strong> 项待完成</li><li><RouterLink to="/student/messages"><strong>{{ query.data.value.unreadMessageCount }}</strong> 条未读</RouterLink></li></ul>
    </template>
  </div>
</template>
