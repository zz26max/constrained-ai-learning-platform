<script setup lang="ts">

import '../../../features/dashboard/home-exploration.css'
import '../../../features/dashboard/home-bplus.css'
import SubjectGlyph from './SubjectGlyph.vue'
import SubjectIdentity from './SubjectIdentity.vue'
import CountProgress from './CountProgress.vue'
import IntegratedTaskStatus from './CraftTaskState.vue'
import {subject,beijingTime} from './presentation'
import {taskDayGroups,taskContentTone} from './content-presentation'
import {chapterEntry} from './refinement'

import { computed, watch } from 'vue'
import {useRoute} from 'vue-router'
import CraftDate from './CraftDate.vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { coursesApi } from '../../../api'
import { useStudentHome } from '../../../features/dashboard/use-student-home'
import { taskAction, deadlineLabel } from '../../../features/assignments/task-presentation'
import { formatTime } from '../../../features/courses/format'

import ApiState from '../../../components/ApiState.vue'
import ActionNotice from '../../../components/ActionNotice.vue'
import AppIcon from '../../../components/AppIcon.vue'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { compactDeadline, chapterOverview } from '../../../features/dashboard/bplus-presentation'
const route=useRoute()
const direction='a'
const design='bplus' as const
const home=useStudentHome()
const {query,tasksQuery,target,nextTask,recentTasks,recentCourse,courseName,TYPE_LABELS,excerpt}=home
const isPlus=computed(()=>design==='bplus')
const selectedCourse=computed(()=>tasksQuery.data.value?.classes[0])
const displayedCourses=computed(()=>tasksQuery.data.value?.classes.slice(0,isPlus.value?1:2)??[])
const deadlineGroups=computed(()=>taskDayGroups(recentTasks.value))
function courseById(id:string|null|undefined){return tasksQuery.data.value?.classes.find(c=>c.offeringId===id)}
const courses=coursesApi()
const chaptersQuery=usePageQuery(async signal=>{
  const id=selectedCourse.value?.offeringId
  if(!id)throw new Error('没有可读取章节的课程')
  const data=(await courses.listChapters(id,{signal})).data
  if(data.offeringId!==id)throw new Error('章节与当前课程不一致，请重新加载')
  return data
})
watch([isPlus,()=>selectedCourse.value?.offeringId],()=>{if(isPlus.value&&selectedCourse.value&&chaptersQuery.data.value?.offeringId!==selectedCourse.value.offeringId)void chaptersQuery.load()},{immediate:true})
const chapterProgress=computed(()=>chapterOverview(chaptersQuery.data.value?.items??[]))
const bplusCourseAction=computed<{label:string;to:RouteLocationRaw}>(()=>{
  const c=selectedCourse.value
  const fallback={label:'查看课程',to:c?{name:'course',params:{offeringId:c.offeringId}}:{name:'courses'}}
  if(!c || c.status==='archived' || chaptersQuery.status.value!=='success')return fallback
  const progress=chapterProgress.value
  const chapter=progress.next??(progress.allRead?(progress.chapters.find(ch=>ch.id===c.currentChapter?.id)??progress.chapters[0]):undefined)
  return chapter?{label:chapterEntry(chapter).label,to:{name:'chapter',params:{offeringId:c.offeringId,chapterId:chapter.id}}}:fallback
})
function datePart(value:string,part:'month'|'day'|'time'){
  const formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',...(part==='month'?{month:'numeric' as const}:part==='day'?{day:'numeric' as const}:{hour:'2-digit' as const,minute:'2-digit' as const,hour12:false})})
  return part==='day'?formatter.formatToParts(new Date(value)).find(p=>p.type==='day')?.value??'':formatter.format(new Date(value))
}
</script>
<template>
  <div class="workspace-page vx-page v35-page v35-home vc-page vc-home home-exploration" :class="[isPlus?'exploration-b exploration-bplus':'exploration-'+design]" :data-design="design" :data-craft="direction" :data-polish="true" data-unread="a">
    <header class="explore-heading">
      <div><p class="explore-eyebrow">知学 / {{ query.status.value==='success' && query.data.value?.termId===null?'当前没有进行中的学期':query.data.value?.termLabel ?? '学习工作空间' }}</p><h1 tabindex="-1">学习首页</h1><p class="explore-intro"><span v-if="query.status.value==='success' && query.data.value">本学期 {{query.data.value.pendingAssignmentCount}} 项待完成，先从仍可提交的任务开始。</span></p></div>
      <RouterLink class="explore-calendar" to="/student/calendar"><AppIcon name="calendar" /><span>查看学习日历</span><span aria-hidden="true">↗</span></RouterLink>
    </header>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value==='success' && query.data.value">
      <div class="explore-composition">
        <div class="explore-primary-column">
        <section class="explore-focus" aria-labelledby="explore-focus-title">
          <div class="focus-main" :class="{'has-bplus-task':isPlus&&nextTask&&tasksQuery.status.value==='success'}">
            <p class="explore-label"><span class="focus-signal" aria-hidden="true" />接下来要做</p>
            <ApiState :status="tasksQuery.status.value" :error="tasksQuery.error.value" @retry="tasksQuery.load" />
            <template v-if="tasksQuery.status.value==='success'">
              <template v-if="nextTask">
                <p v-if="!isPlus" class="focus-course">{{courseName(nextTask.offeringId)}}<span>{{TYPE_LABELS[nextTask.type]}}</span></p>
                <h2 id="explore-focus-title" :title="nextTask.title">{{nextTask.title}}</h2>
                <p v-if="isPlus" class="focus-course"><SubjectIdentity :course="courseById(nextTask.offeringId)" /><span>{{TYPE_LABELS[nextTask.type]}}</span></p>
                <p v-if="nextTask.title.includes('�')" role="alert" class="focus-data-warning">原始标题存在乱码，请联系教师修正。</p>
                <IntegratedTaskStatus :task="nextTask" :detail="nextTask" :show-deadline="!isPlus" />
                <div v-if="isPlus" class="bplus-deadline"><span>截止 · 北京时间</span><CraftDate :value="nextTask.dueAt"/><small>{{deadlineLabel(nextTask.dueAt)}}</small></div>
                <div class="focus-actions"><RouterLink class="button primary" data-home-action="primary" :data-task-id="nextTask.id" :to="{name:'student-assignment',params:{id:nextTask.id}}">{{taskAction(nextTask,nextTask)}}<span aria-hidden="true"> →</span></RouterLink><RouterLink to="/student/assignments">查看全部待办 <span aria-hidden="true">↗</span></RouterLink></div><p v-if="true" class="polish-task-context"><span>按可提交任务的截止时间先后展示，包含补交任务。</span></p>
              </template>
              <template v-else>
                <h2 id="explore-focus-title">当前没有可提交的待办</h2><p class="focus-empty-text">把时间留给课程学习。已截止任务与历史提交仍可查看。</p>
                <div class="focus-actions"><RouterLink v-if="isPlus" class="button primary" data-home-action="primary" :to="bplusCourseAction.to">{{selectedCourse?bplusCourseAction.label:'查看我的课程'}} →</RouterLink><RouterLink v-else class="button primary" data-home-action="primary" :to="recentCourse?.currentChapter?{name:'chapter',params:{offeringId:recentCourse.offeringId,chapterId:recentCourse.currentChapter.id}}:'/course'">{{recentCourse?'继续最近的课程':'查看我的课程'}} →</RouterLink><RouterLink to="/student/assignments">查看全部待办 ↗</RouterLink></div>
              </template>
            </template>
          </div>
          <div v-if="!isPlus && nextTask && tasksQuery.status.value==='success'" class="focus-deadline" aria-label="任务截止时间">
            <span class="deadline-caption">截止日期 · 北京时间</span><div class="deadline-date"><span class="deadline-month">{{datePart(nextTask.dueAt,'month')}}</span><strong>{{datePart(nextTask.dueAt,'day')}}</strong></div><span class="deadline-time">{{datePart(nextTask.dueAt,'time')}}</span><span class="deadline-relative">{{deadlineLabel(nextTask.dueAt)}}</span><time class="deadline-full" :datetime="nextTask.dueAt">{{formatTime(nextTask.dueAt)}}</time>
          </div>
        </section>

        <section class="explore-tasks" aria-labelledby="explore-tasks-title">
          <header class="explore-section-heading"><div><p class="explore-eyebrow">{{isPlus?'截止时间 · 北京时间':'按截止时间排序'}}</p><h2 id="explore-tasks-title">近期任务</h2></div><RouterLink to="/student/assignments">全部作业 ↗</RouterLink></header>
          <p v-if="tasksQuery.status.value==='loading'" class="explore-muted" role="status">正在读取近期任务…</p>
          <p v-else-if="tasksQuery.status.value==='error'" class="explore-muted">任务未完整加载，请在上方重试。</p>
          <div v-else-if="isPlus&&recentTasks.length" class="bplus-task-groups"><section v-for="group in deadlineGroups" :key="group.key" class="bplus-task-group" :data-day="group.key" :aria-label="group.key+'截止任务'"><header class="bplus-group-heading"><CraftDate :value="group.dueAt" day-only/><span>{{group.tasks.length}} 项任务</span><small>{{group.context}}</small></header><ul class="bplus-task-list"><li v-for="task in group.tasks" :key="task.id" :data-task-id="task.id" :data-tone="taskContentTone(task,task)"><div class="task-line-content"><RouterLink class="explore-task-name" :title="task.title" :to="{name:'student-assignment',params:{id:task.id}}">{{task.title}}</RouterLink><p class="explore-muted"><SubjectIdentity :course="courseById(task.offeringId)" /></p><div class="content-task-meta"><IntegratedTaskStatus :task="task" :detail="task" :show-deadline="false" /><p class="content-task-time"><time :datetime="task.dueAt">{{beijingTime(task.dueAt)}} 截止</time><span>{{deadlineLabel(task.dueAt)}}</span></p></div></div><RouterLink class="task-line-action" :to="{name:'student-assignment',params:{id:task.id}}">{{taskAction(task,task)}} →</RouterLink></li></ul></section></div>
          <ul v-else-if="recentTasks.length" class="explore-task-list">
            <li v-for="task in recentTasks" :key="task.id" :data-task-id="task.id">
              <div class="task-date-index"><span>{{datePart(task.dueAt,'month')}}</span><strong>{{datePart(task.dueAt,'day')}}</strong><small>{{datePart(task.dueAt,'time')}}</small></div>
              <div class="task-line-content"><RouterLink class="explore-task-name" :title="task.title" :to="{name:'student-assignment',params:{id:task.id}}">{{task.title}}</RouterLink><p class="explore-muted"><SubjectIdentity :course="courseById(task.offeringId)" /></p><time class="task-line-time" :datetime="task.dueAt">{{formatTime(task.dueAt)}} · 北京时间</time><IntegratedTaskStatus :task="task" :detail="task" /></div>
              <RouterLink class="task-line-action" :to="{name:'student-assignment',params:{id:task.id}}">{{taskAction(task,task)}} <span aria-hidden="true">→</span></RouterLink>
            </li>
          </ul>
          <p v-else class="explore-empty">没有更多可提交的近期任务。已截止任务可在全部作业中查看。</p>
        </section>

        </div><div class="explore-secondary-column">
        <section class="explore-courses" aria-labelledby="explore-courses-title">
          <header class="explore-section-heading"><div><p class="explore-eyebrow">{{isPlus?'回到学习现场':'最近学习的课程'}}</p><h2 id="explore-courses-title">最近课程</h2></div><RouterLink to="/course">{{isPlus?'查看全部课程':'全部课程'}} ↗</RouterLink></header>
          <p v-if="tasksQuery.status.value==='loading'" class="explore-muted">正在读取课程…</p>
          <p v-else-if="tasksQuery.status.value==='error'" class="explore-muted">课程未完整加载，请在上方重试。</p>
          <ul v-else-if="tasksQuery.data.value?.classes.length" class="explore-course-list">
            <li v-for="course in displayedCourses" :key="course.offeringId" :data-course-id="course.offeringId" :data-family="subject(course.mark).family">
              <div class="v35-recent-course-heading"><SubjectGlyph :mark="course.mark"/><div><span class="vx-muted">{{subject(course.mark).label}}</span><h3><RouterLink :to="{name:'course',params:{offeringId:course.offeringId}}">{{course.title}}</RouterLink></h3><span class="vx-muted">{{course.status==='archived'?'已归档':'进行中'}} · {{course.groupName}}</span></div></div>
              <div class="explore-course-info"><p class="v35-teachers">{{course.teachers.map(t=>t.displayName).join('、')}}</p>
                <template v-if="isPlus"><ApiState :status="chaptersQuery.status.value" :error="chaptersQuery.error.value" @retry="chaptersQuery.load" /><template v-if="chaptersQuery.status.value==='success'"><template v-if="chapterProgress.total"><CountProgress refined :completed="chapterProgress.completed" :total="chapterProgress.total" :title="course.title"/><p v-if="chapterProgress.unknown" class="vx-muted">部分阅读状态未提供</p><p v-if="chapterProgress.allRead" class="bplus-course-hint">已开放章节已全部阅读，后续内容以教师发布为准。</p><p v-else-if="chapterProgress.next" class="bplus-course-hint">下一章节：{{chapterProgress.next.title}}</p></template><p v-else class="explore-muted">暂无已开放章节</p></template></template>
                <template v-else><template v-if="!course.progress.notConfigured"><div class="explore-progress-caption"><span>{{course.progress.unit==='chapter'?'章节进度':'作业进度'}}</span><span>{{course.progress.completed}} / {{course.progress.total}} · {{course.progress.percent}}%</span></div><div class="explore-progress" role="progressbar" :aria-label="course.title+'进度'" :aria-valuenow="course.progress.percent" aria-valuemin="0" aria-valuemax="100"><span :style="{width:course.progress.percent+'%'}" /></div></template><p v-else class="explore-muted">未配置学习内容</p></template>
                <p v-if="course.currentChapter && course.currentChapter.id!==chapterProgress.next?.id" class="explore-chapter"><span aria-hidden="true">○</span> 最近阅读 · {{course.currentChapter.title}}</p><p v-else-if="!course.currentChapter" class="explore-muted">暂无最近阅读记录</p>
                <p v-if="course.pendingAssignmentCount || course.unreadFeedbackCount" class="explore-course-counts">{{course.pendingAssignmentCount}} 项待办 · {{course.unreadFeedbackCount}} 条未读反馈</p>
                <div class="explore-course-actions"><template v-if="isPlus"><RouterLink class="bplus-course-action" :to="bplusCourseAction.to">{{bplusCourseAction.label}} →</RouterLink><RouterLink v-if="bplusCourseAction.label!=='查看课程'" :to="{name:'course',params:{offeringId:course.offeringId}}">查看课程</RouterLink></template><RouterLink v-else :to="course.currentChapter && course.progress.percent<100 && course.status==='active'?{name:'chapter',params:{offeringId:course.offeringId,chapterId:course.currentChapter.id}}:{name:'course',params:{offeringId:course.offeringId}}">{{course.progress.percent===100 || course.status==='archived' || !course.currentChapter?'查看课程':'继续学习'}} →</RouterLink><RouterLink :to="{name:'student-progress',params:{offeringId:course.offeringId}}">学习记录</RouterLink><RouterLink :to="{name:'student-notices',params:{offeringId:course.offeringId}}">公告</RouterLink></div>
              </div>
            </li>
          </ul><p v-else class="explore-empty">本学期暂无课程。<RouterLink to="/course">前往我的课程</RouterLink></p>
        </section>

        <aside class="explore-notes" aria-label="反馈与公告">
          <section class="explore-feedback" aria-labelledby="explore-feedback-title"><h2 id="explore-feedback-title">最近反馈</h2><template v-if="query.data.value.recentFeedback"><p class="v35-feedback-course"><SubjectIdentity :course="courseById(query.data.value.recentFeedback.offeringId)" /></p><div class="feedback-score"><strong>{{query.data.value.recentFeedback.score}}</strong><span>/ {{query.data.value.recentFeedback.maxScore}}</span><small>本次作业评价</small></div><RouterLink class="feedback-title" :to="{name:'student-assignment',params:{id:query.data.value.recentFeedback.assignmentId},query:{feedbackId:query.data.value.recentFeedback.id}}">{{query.data.value.recentFeedback.assignmentTitle}} ↗</RouterLink><p class="feedback-quote">{{excerpt(query.data.value.recentFeedback.comment,120)}}</p><details v-if="query.data.value.recentFeedback.comment.length>120"><summary>展开完整反馈</summary><p>{{query.data.value.recentFeedback.comment}}</p></details><time class="explore-muted">{{formatTime(query.data.value.recentFeedback.publishedAt)}}</time></template><p v-else class="explore-empty">暂无已发布的评价。教师发布后会在这里显示。</p></section>
          <section class="explore-notice" aria-labelledby="explore-notice-title"><h2 id="explore-notice-title">最新公告</h2><ActionNotice :error="target.error.value" :message="null" /><template v-if="query.data.value.recentNotice"><button v-if="target.canOpen(query.data.value.recentNotice.target)" class="notice-open" @click="target.open(query.data.value.recentNotice.target)">{{query.data.value.recentNotice.title}} ↗</button><RouterLink v-else class="notice-open" to="/student/messages">{{query.data.value.recentNotice.title}} ↗</RouterLink><p class="explore-muted">{{query.data.value.recentNotice.sender?.displayName??'系统'}} · {{formatTime(query.data.value.recentNotice.createdAt)}}</p><span class="notice-read">{{query.data.value.recentNotice.readAt===null?'● 未读':'已读'}}</span></template><p v-else class="explore-empty">暂无课程公告。新通知会在这里显示。</p></section>
        </aside></div>
      </div>
      <footer class="explore-overview" aria-label="学习概览"><span>本学期概览</span><span><strong>{{query.data.value.courseCount}}</strong> 门课程</span><RouterLink to="/student/assignments"><strong>{{query.data.value.pendingAssignmentCount}}</strong> 项待完成</RouterLink><RouterLink to="/student/messages"><strong>{{query.data.value.unreadMessageCount}}</strong> 条未读消息 ↗</RouterLink></footer>
    </template>
  </div>
</template>
