<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { StudentHomeState } from './use-student-home'
import { taskAction, deadlineLabel } from '../assignments/task-presentation'
import { formatTime } from '../courses/format'
import TaskStatus from '../../components/TaskStatus.vue'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import AppIcon from '../../components/AppIcon.vue'
const props=defineProps<{design:'a'|'b';home:StudentHomeState}>()
const {query,tasksQuery,target,nextTask,recentTasks,recentCourse,courseName,TYPE_LABELS,excerpt}=props.home
function datePart(value:string,part:'month'|'day'|'time'){
  const formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',...(part==='month'?{month:'numeric' as const}:part==='day'?{day:'numeric' as const}:{hour:'2-digit' as const,minute:'2-digit' as const,hour12:false})})
  return part==='day'?formatter.formatToParts(new Date(value)).find(p=>p.type==='day')?.value??'':formatter.format(new Date(value))
}
</script>
<template>
  <div class="workspace-page home-exploration" :class="'exploration-'+design" :data-design="design">
    <header class="explore-heading">
      <div><p class="explore-eyebrow">知学 / {{ query.data.value?.termLabel ?? '学习工作空间' }}</p><h1 tabindex="-1">{{design==='a'?'把下一步，学明白。':'每一步，向前。'}}</h1><p class="explore-intro">学习首页<span v-if="query.status.value==='success' && query.data.value"> · 本学期 {{query.data.value.pendingAssignmentCount}} 项待完成，先从仍可提交的任务开始。</span></p></div>
      <RouterLink class="explore-calendar" to="/student/calendar"><AppIcon name="calendar" /><span>查看学习日历</span><span aria-hidden="true">↗</span></RouterLink>
    </header>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value==='success' && query.data.value">
      <div class="explore-composition">
        <section class="explore-focus" aria-labelledby="explore-focus-title">
          <div class="focus-main">
            <p class="explore-label"><span class="focus-signal" aria-hidden="true" />接下来要做</p>
            <ApiState :status="tasksQuery.status.value" :error="tasksQuery.error.value" @retry="tasksQuery.load" />
            <template v-if="tasksQuery.status.value==='success'">
              <template v-if="nextTask">
                <p class="focus-course">{{courseName(nextTask.offeringId)}}<span>{{TYPE_LABELS[nextTask.type]}}</span></p>
                <h2 id="explore-focus-title" :title="nextTask.title">{{nextTask.title}}</h2>
                <p v-if="nextTask.title.includes('�')" role="alert" class="focus-data-warning">原始标题存在乱码，请联系教师修正。</p>
                <TaskStatus :task="nextTask" :detail="nextTask" />
                <div class="focus-actions"><RouterLink class="button primary" data-home-action="primary" :data-task-id="nextTask.id" :to="{name:'student-assignment',params:{id:nextTask.id}}">{{taskAction(nextTask,nextTask)}}<span aria-hidden="true"> →</span></RouterLink><RouterLink to="/student/assignments">查看全部待办 <span aria-hidden="true">↗</span></RouterLink></div>
              </template>
              <template v-else>
                <h2 id="explore-focus-title">当前没有可提交的待办</h2><p class="focus-empty-text">把时间留给课程学习。已截止任务与历史提交仍可查看。</p>
                <div class="focus-actions"><RouterLink class="button primary" data-home-action="primary" :to="recentCourse?.currentChapter?{name:'chapter',params:{offeringId:recentCourse.offeringId,chapterId:recentCourse.currentChapter.id}}:'/course'">{{recentCourse?'继续最近的课程':'查看我的课程'}} →</RouterLink><RouterLink to="/student/assignments">查看全部待办 ↗</RouterLink></div>
              </template>
            </template>
          </div>
          <div v-if="nextTask && tasksQuery.status.value==='success'" class="focus-deadline" aria-label="任务截止时间">
            <span class="deadline-caption">截止日期 · 北京时间</span><div class="deadline-date"><span class="deadline-month">{{datePart(nextTask.dueAt,'month')}}</span><strong>{{datePart(nextTask.dueAt,'day')}}</strong></div><span class="deadline-time">{{datePart(nextTask.dueAt,'time')}}</span><span class="deadline-relative">{{deadlineLabel(nextTask.dueAt)}}</span><time class="deadline-full" :datetime="nextTask.dueAt">{{formatTime(nextTask.dueAt)}}</time>
          </div>
        </section>

        <section class="explore-tasks" aria-labelledby="explore-tasks-title">
          <header class="explore-section-heading"><div><p class="explore-eyebrow">按截止时间排序</p><h2 id="explore-tasks-title">近期任务</h2></div><RouterLink to="/student/assignments">全部作业 ↗</RouterLink></header>
          <p v-if="tasksQuery.status.value==='loading'" class="explore-muted" role="status">正在读取近期任务…</p>
          <p v-else-if="tasksQuery.status.value==='error'" class="explore-muted">任务未完整加载，请在上方重试。</p>
          <ul v-else-if="recentTasks.length" class="explore-task-list">
            <li v-for="task in recentTasks" :key="task.id" :data-task-id="task.id">
              <div class="task-date-index"><span>{{datePart(task.dueAt,'month')}}</span><strong>{{datePart(task.dueAt,'day')}}</strong><small>{{datePart(task.dueAt,'time')}}</small></div>
              <div class="task-line-content"><RouterLink class="explore-task-name" :title="task.title" :to="{name:'student-assignment',params:{id:task.id}}">{{task.title}}</RouterLink><p class="explore-muted">{{courseName(task.offeringId)}}</p><time class="task-line-time" :datetime="task.dueAt">{{formatTime(task.dueAt)}} · 北京时间</time><TaskStatus :task="task" :detail="task" /></div>
              <RouterLink class="task-line-action" :to="{name:'student-assignment',params:{id:task.id}}">{{taskAction(task,task)}} <span aria-hidden="true">→</span></RouterLink>
            </li>
          </ul>
          <p v-else class="explore-empty">没有更多可提交的近期任务。已截止任务可在全部作业中查看。</p>
        </section>

        <section class="explore-courses" aria-labelledby="explore-courses-title">
          <header class="explore-section-heading"><div><p class="explore-eyebrow">最近学习的课程</p><h2 id="explore-courses-title">{{design==='a'?'回到课程':'沿着章节，继续'}}</h2></div><RouterLink to="/course">全部课程 ↗</RouterLink></header>
          <p v-if="tasksQuery.status.value==='loading'" class="explore-muted">正在读取课程…</p>
          <p v-else-if="tasksQuery.status.value==='error'" class="explore-muted">课程未完整加载，请在上方重试。</p>
          <ul v-else-if="tasksQuery.data.value?.classes.length" class="explore-course-list">
            <li v-for="course in tasksQuery.data.value.classes.slice(0,2)" :key="course.offeringId" :data-course-id="course.offeringId">
              <div class="course-discipline"><span>{{course.mark}}</span><small>{{course.status==='archived'?'已归档':'进行中'}}</small></div>
              <div class="explore-course-info"><h3><RouterLink :title="course.title" :to="{name:'course',params:{offeringId:course.offeringId}}">{{course.title}}</RouterLink></h3><p>{{course.groupName}} · {{course.teachers.map(t=>t.displayName).join('、')}}</p>
                <template v-if="!course.progress.notConfigured"><div class="explore-progress-caption"><span>{{course.progress.unit==='chapter'?'章节进度':'作业进度'}}</span><span>{{course.progress.completed}} / {{course.progress.total}} · {{course.progress.percent}}%</span></div><div class="explore-progress" role="progressbar" :aria-label="course.title+'进度'" :aria-valuenow="course.progress.percent" aria-valuemin="0" aria-valuemax="100"><span :style="{width:course.progress.percent+'%'}" /></div></template><p v-else class="explore-muted">未配置学习内容</p>
                <p v-if="course.currentChapter" class="explore-chapter"><span aria-hidden="true">○</span> 最近阅读 · {{course.currentChapter.title}}</p><p v-else class="explore-muted">暂无可阅读章节</p>
                <p v-if="course.pendingAssignmentCount || course.unreadFeedbackCount" class="explore-course-counts">{{course.pendingAssignmentCount}} 项待办 · {{course.unreadFeedbackCount}} 条未读反馈</p>
                <div class="explore-course-actions"><RouterLink :to="course.currentChapter && course.progress.percent<100 && course.status==='active'?{name:'chapter',params:{offeringId:course.offeringId,chapterId:course.currentChapter.id}}:{name:'course',params:{offeringId:course.offeringId}}">{{course.progress.percent===100 || course.status==='archived' || !course.currentChapter?'查看课程':'继续学习'}} →</RouterLink><RouterLink :to="{name:'student-progress',params:{offeringId:course.offeringId}}">学习记录</RouterLink><RouterLink :to="{name:'student-notices',params:{offeringId:course.offeringId}}">公告</RouterLink></div>
              </div>
            </li>
          </ul><p v-else class="explore-empty">本学期暂无课程。<RouterLink to="/course">前往我的课程</RouterLink></p>
        </section>

        <aside class="explore-notes" aria-label="反馈与公告">
          <section class="explore-feedback" aria-labelledby="explore-feedback-title"><p class="explore-eyebrow">来自教学现场</p><h2 id="explore-feedback-title">最近反馈</h2><template v-if="query.data.value.recentFeedback"><div class="feedback-score"><strong>{{query.data.value.recentFeedback.score}}</strong><span>/ {{query.data.value.recentFeedback.maxScore}}</span><small>本次作业评价</small></div><RouterLink class="feedback-title" :to="{name:'student-assignment',params:{id:query.data.value.recentFeedback.assignmentId},query:{feedbackId:query.data.value.recentFeedback.id}}">{{query.data.value.recentFeedback.assignmentTitle}} ↗</RouterLink><p class="feedback-quote">{{excerpt(query.data.value.recentFeedback.comment,120)}}</p><details v-if="query.data.value.recentFeedback.comment.length>120"><summary>展开完整反馈</summary><p>{{query.data.value.recentFeedback.comment}}</p></details><time class="explore-muted">{{formatTime(query.data.value.recentFeedback.publishedAt)}}</time></template><p v-else class="explore-empty">暂无已发布的评价。教师发布后会在这里显示。</p></section>
          <section class="explore-notice" aria-labelledby="explore-notice-title"><p class="explore-eyebrow">课程动态</p><h2 id="explore-notice-title">最新公告</h2><ActionNotice :error="target.error.value" :message="null" /><template v-if="query.data.value.recentNotice"><button v-if="target.canOpen(query.data.value.recentNotice.target)" class="notice-open" @click="target.open(query.data.value.recentNotice.target)">{{query.data.value.recentNotice.title}} ↗</button><RouterLink v-else class="notice-open" to="/student/messages">{{query.data.value.recentNotice.title}} ↗</RouterLink><p class="explore-muted">{{query.data.value.recentNotice.sender?.displayName??'系统'}} · {{formatTime(query.data.value.recentNotice.createdAt)}}</p><span class="notice-read">{{query.data.value.recentNotice.readAt===null?'● 未读':'已读'}}</span></template><p v-else class="explore-empty">暂无课程公告。新通知会在这里显示。</p></section>
        </aside>
      </div>
      <footer class="explore-overview" aria-label="学习概览"><span>本学期概览</span><span><strong>{{query.data.value.courseCount}}</strong> 门课程</span><RouterLink to="/student/assignments"><strong>{{query.data.value.pendingAssignmentCount}}</strong> 项待完成</RouterLink><RouterLink to="/student/messages"><strong>{{query.data.value.unreadMessageCount}}</strong> 条未读消息 ↗</RouterLink></footer>
    </template>
  </div>
</template>
