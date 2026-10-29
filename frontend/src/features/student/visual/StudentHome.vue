<script setup lang="ts">
import IntegratedTaskStatus from './CraftTaskState.vue'
import {taskContentTone} from './content-presentation'
import {chapterEntry} from './refinement'

import { computed, watch } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { coursesApi } from '../../../api'
import { useStudentHome } from '../../../features/dashboard/use-student-home'
import { taskAction, deadlineLabel, canEnterWorkspace } from '../../../features/assignments/task-presentation'
import type { AssignmentDetailDTO } from '../../../api/assignments'
import { formatTime } from '../../../features/courses/format'

import ApiState from '../../../components/ApiState.vue'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { chapterOverview } from '../../../features/dashboard/bplus-presentation'
import { useAuthStore } from '../../../stores/auth'

const auth = useAuthStore()
const home = useStudentHome()
const { query, tasksQuery, nextTask, recentTasks, TYPE_LABELS, excerpt } = home
const selectedCourse = computed(() => tasksQuery.data.value?.classes[0])
const chaptersQuery = usePageQuery(async signal => {
  const id = selectedCourse.value?.offeringId
  if (!id) throw new Error('没有可读取章节的课程')
  const data = (await coursesApi().listChapters(id, { signal })).data
  if (data.offeringId !== id) throw new Error('章节与当前课程不一致，请重新加载')
  return data
})
watch(() => selectedCourse.value?.offeringId, () => {
  if (selectedCourse.value && chaptersQuery.data.value?.offeringId !== selectedCourse.value.offeringId) void chaptersQuery.load()
}, { immediate: true })
const chapterProgress = computed(() => chapterOverview(chaptersQuery.data.value?.items ?? []))
const chaptersFailed = computed(() => chaptersQuery.status.value === 'error')
const bplusCourseAction = computed<{ label: string; to: RouteLocationRaw }>(() => {
  const c = selectedCourse.value
  const fallback = { label: '查看课程', to: c ? { name: 'course', params: { offeringId: c.offeringId } } : { name: 'courses' } }
  if (!c || c.status === 'archived' || chaptersQuery.status.value !== 'success') return fallback
  const progress = chapterProgress.value
  const chapter = progress.next ?? (progress.allRead ? (progress.chapters.find(ch => ch.id === c.currentChapter?.id) ?? progress.chapters[0]) : undefined)
  return chapter ? { label: chapterEntry(chapter).label, to: { name: 'chapter', params: { offeringId: c.offeringId, chapterId: chapter.id } } } : fallback
})

function courseById(id: string | null | undefined) {
  return tasksQuery.data.value?.classes.find(c => c.offeringId === id)
}
function taskEntry(task: AssignmentDetailDTO | null | undefined) {
  if (!task) return { name: 'student-assignments' } as const
  return canEnterWorkspace(task, task)
    ? { name: 'student-workspace' as const, params: { id: task.id } }
    : { name: 'student-assignment' as const, params: { id: task.id } }
}

const greeting = computed(() => {
  const serverTime = query.data.value?.serverTime
  if (!serverTime) return '学习首页'
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(new Date(serverTime)))
  if (!Number.isFinite(hour)) return '学习首页'
  return hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
})
const displayName = computed(() => auth.identity?.displayName ?? null)

const upcomingTasks = computed(() => recentTasks.value
  .filter(task => !task.overdue && Date.parse(task.dueAt) > Date.now())
  .slice(0, 3))

const dueCountdown = computed(() => nextTask.value ? countdown(nextTask.value.dueAt) : null)
type Tone = '' | 'urgent' | 'late'
function countdown(value: string): { label: string; value: string; tone: Tone } {
  const diff = Date.parse(value) - Date.now()
  if (!Number.isFinite(diff)) return { label: '截止时间', value: '待确认', tone: '' }
  if (diff <= 0) {
    return { label: '已逾期', value: `${Math.max(1, Math.ceil(-diff / 86400000))} 天`, tone: 'late' }
  }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days >= 3) return { label: '距离截止', value: `${days} 天`, tone: '' }
  const minutes = Math.max(1, Math.floor((diff % 3600000) / 60000))
  const text = days > 0 ? `${days} 天 ${hours} 小时` : hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`
  return { label: '距离截止', value: text, tone: 'urgent' }
}
const dayFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
function dueDay(value: string) { return dayFormat.format(new Date(value)) }
function dueWeekdayTime(value: string) { return timeFormat.format(new Date(value)) }
</script>

<template>
  <div class="workspace-page sr-home" data-design="bplus">
    <header class="home-head">
      <div>
        <h1 tabindex="-1">{{ greeting }}<template v-if="displayName">，{{ displayName }}</template></h1>
        <p v-if="query.status.value === 'success' && query.data.value?.termId === null" class="home-note">当前没有进行中的学期</p>
      </div>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <div v-if="query.status.value === 'success' && query.data.value" class="home">
      <section class="home-sec" aria-labelledby="home-current-title">
        <header class="sec-head"><h2 id="home-current-title">当前任务</h2></header>
        <section class="explore-focus" aria-labelledby="explore-focus-title">
          <ApiState :status="tasksQuery.status.value" :error="tasksQuery.error.value" @retry="tasksQuery.load" />
          <template v-if="tasksQuery.status.value === 'success'">
            <template v-if="nextTask">
              <div class="focus-top">
                <p class="explore-label">{{ courseById(nextTask.offeringId)?.title ?? '当前任务' }}</p>
                <IntegratedTaskStatus :task="nextTask" :detail="nextTask" :show-deadline="false" />
              </div>
              <h2 id="explore-focus-title" :title="nextTask.title">{{ nextTask.title }}</h2>
              <p class="focus-course">{{ TYPE_LABELS[nextTask.type] }}<template v-if="nextTask.title.includes('�')"> · <span class="focus-data-warning">原始标题存在乱码，请联系教师修正。</span></template></p>
              <div class="focus-foot">
                <div class="focus-side">
                  <div class="focus-actions">
                    <RouterLink class="button primary" data-home-action="primary" :data-task-id="nextTask.id" :to="taskEntry(nextTask)">{{ taskAction(nextTask, nextTask) }}</RouterLink>
                    <RouterLink :to="{ name: 'student-assignment', params: { id: nextTask.id } }">查看要求</RouterLink>
                  </div>
                  <p class="polish-task-context">按可提交任务的截止时间先后展示，包含补交任务。</p>
                </div>
                <div v-if="dueCountdown" class="due" :data-tone="dueCountdown.tone">
                  <span class="due-label">{{ dueCountdown.label }}</span>
                  <b class="due-value" :class="dueCountdown.tone">{{ dueCountdown.value }}</b>
                  <span class="due-date">{{ formatTime(nextTask.dueAt) }}（北京时间）</span>
                </div>
              </div>
              <p v-if="tasksQuery.data.value?.unconfirmed" class="focus-unconfirmed" role="status">
                另有 {{ tasksQuery.data.value.unconfirmed }} 项任务状态未能确认，已按可确认结果展示。
                <button type="button" class="quiet-btn" @click="tasksQuery.load">重试</button>
              </p>
            </template>

            <template v-else-if="tasksQuery.data.value?.unconfirmed">
              <h2 id="explore-focus-title">任务状态未能完全确认</h2>
              <p class="focus-empty-text">另有 {{ tasksQuery.data.value.unconfirmed }} 项待办的提交资格未能确认，确认前不假设其可提交或不可提交。</p>
              <div class="focus-actions">
                <button type="button" class="button secondary" @click="tasksQuery.load">重试确认</button>
                <RouterLink to="/student/assignments">查看全部待办</RouterLink>
              </div>
              <p v-if="chaptersFailed" class="focus-unconfirmed">章节进度未能确认。<template v-if="chaptersQuery.error.value?.requestId">requestId: {{ chaptersQuery.error.value.requestId }}。 </template><button type="button" class="quiet-btn" @click="chaptersQuery.load">重新加载</button></p>
            </template>

            <template v-else>
              <h2 id="explore-focus-title">当前没有可提交的待办</h2>
              <p class="focus-empty-text">把时间留给课程学习。已截止任务与历史提交仍可查看。</p>
              <div class="focus-actions">
                <RouterLink class="button primary bplus-course-action" data-home-action="primary" :to="bplusCourseAction.to">{{ bplusCourseAction.label }}</RouterLink>
                <RouterLink to="/student/assignments">查看全部待办</RouterLink>
              </div>
              <p v-if="chaptersFailed" class="focus-unconfirmed">章节进度未能确认，已按课程页入口处理。<template v-if="chaptersQuery.error.value?.requestId">requestId: {{ chaptersQuery.error.value.requestId }}。 </template><button type="button" class="quiet-btn" @click="chaptersQuery.load">重新加载</button></p>
            </template>
          </template>
        </section>
      </section>

      <section class="home-sec" aria-labelledby="home-next-title">
        <header class="sec-head"><h2 id="home-next-title">接下来</h2><RouterLink to="/student/assignments">全部</RouterLink></header>
        <div v-if="upcomingTasks.length" class="next-list">
          <RouterLink v-for="task in upcomingTasks" :key="task.id" class="next-row" :to="{ name: 'student-assignment', params: { id: task.id } }" :data-task-id="task.id" :data-tone="taskContentTone(task, task)">
            <span class="next-date"><b>{{ dueDay(task.dueAt) }}</b><span>{{ dueWeekdayTime(task.dueAt) }}</span></span>
            <span class="next-main"><b>{{ task.title }}</b><span>{{ courseById(task.offeringId)?.title }}</span></span>
            <span class="next-rel" :data-tone="taskContentTone(task, task)">{{ deadlineLabel(task.dueAt) }}</span>
          </RouterLink>
        </div>
        <p v-else-if="tasksQuery.status.value === 'loading'" class="home-empty" role="status">正在读取近期任务…</p>
        <p v-else-if="tasksQuery.status.value === 'error'" class="home-empty">任务未完整加载，请在上方重试。</p>
        <p v-else class="home-empty">近期没有新的截止。</p>
      </section>

      <section class="home-sec" aria-labelledby="home-feedback-title">
        <header class="sec-head">
          <h2 id="home-feedback-title">最新评价</h2>
          <RouterLink v-if="query.data.value.recentFeedback" :to="{ name: 'student-progress', params: { offeringId: query.data.value.recentFeedback.offeringId } }">学习记录</RouterLink>
        </header>
        <RouterLink v-if="query.data.value.recentFeedback" class="home-fb" :to="{ name: 'student-assignment', params: { id: query.data.value.recentFeedback.assignmentId }, query: { feedbackId: query.data.value.recentFeedback.id } }">
          <span class="home-fb-score">{{ query.data.value.recentFeedback.score }}<small>/{{ query.data.value.recentFeedback.maxScore }}</small></span>
          <span class="home-fb-main">
            <b>{{ query.data.value.recentFeedback.assignmentTitle }}</b>
            <span class="home-fb-meta">{{ courseById(query.data.value.recentFeedback.offeringId)?.title }} · {{ formatTime(query.data.value.recentFeedback.publishedAt) }}</span>
            <span class="home-fb-comment">{{ excerpt(query.data.value.recentFeedback.comment, 120) }}</span>
          </span>
        </RouterLink>
        <p v-else class="home-empty">还没有已发布的评价。教师发布后会在这里显示。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.student-release .sr-home .home-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 0 0 24px; }
.student-release .sr-home .home-head h1 { font-size: 20px; font-weight: 600; line-height: 1.3; }
.student-release .sr-home .home-note { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.student-release .sr-home .home { display: grid; gap: 52px; max-width: 940px; }
.student-release .sr-home .home-sec { min-width: 0; }
.student-release .sr-home .sec-head { display: flex; align-items: baseline; gap: 12px; margin: 0 0 6px; }
.student-release .sr-home .sec-head h2 { flex: 1; margin: 0; color: var(--muted); font-size: 13px; font-weight: 600; letter-spacing: .3px; }
.student-release .sr-home .sec-head a { font-size: 13px; }

/* 当前任务：页面上唯一带框的块 */
.student-release .sr-home .explore-focus { padding: 26px 30px 24px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-panel); box-shadow: none; }
.student-release .sr-home .focus-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.student-release .sr-home .explore-label { margin: 0; color: var(--muted); font-size: 13px; }
.student-release .sr-home .explore-focus h2 { margin: 10px 0 0; color: var(--ink); font-size: 32px; line-height: 1.3; font-weight: 700; letter-spacing: -.3px; overflow-wrap: anywhere; }
.student-release .sr-home .focus-course { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
.student-release .sr-home .focus-data-warning { color: var(--red); }
.student-release .sr-home .focus-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
.student-release .sr-home .focus-side { display: grid; gap: 10px; min-width: 0; }
.student-release .sr-home .focus-actions { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
.student-release .sr-home .focus-actions > a:not(.button) { color: var(--blue); font-size: 14px; }
.student-release .sr-home .focus-actions > a:not(.button):hover { text-decoration: underline; text-underline-offset: 3px; }
.student-release .sr-home .polish-task-context { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
.student-release .sr-home .due { display: grid; gap: 4px; justify-items: end; text-align: right; }
.student-release .sr-home .due-label, .student-release .sr-home .due-date { color: var(--muted); font-size: 13px; }
.student-release .sr-home .due-date { font-variant-numeric: tabular-nums; }
.student-release .sr-home .due-value { font-size: 28px; font-weight: 700; line-height: 1.15; letter-spacing: -.4px; font-variant-numeric: tabular-nums; }
.student-release .sr-home .due-value.urgent, .student-release .sr-home .due-value.late { color: var(--orange); }
.student-release .sr-home .focus-unconfirmed { margin: 14px 0 0; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; line-height: 1.7; }
.student-release .sr-home .focus-empty-text { margin: 8px 0 0; color: var(--muted); font-size: 14px; line-height: 1.7; }
.student-release .sr-home .explore-focus .focus-actions { margin-top: 20px; }
.student-release .sr-home .quiet-btn { border: 0; padding: 0; background: none; color: var(--blue); font: inherit; cursor: pointer; }
.student-release .sr-home .quiet-btn:hover { text-decoration: underline; text-underline-offset: 3px; }
.student-release .sr-home .explore-focus :deep(.vc-task-state) { justify-content: flex-end; font-size: 13px; }
.student-release .sr-home .explore-focus :deep(.vc-process) { color: var(--blue); font-weight: 600; }
.student-release .sr-home .explore-focus :deep(.vc-permission) { color: var(--muted); }
.student-release .sr-home .explore-focus :deep(.vc-permission.is-late) { color: var(--orange); }

/* 接下来：无框行，日期 / 标题与课程 / 剩余时间 */
.student-release .sr-home .next-list { display: grid; }
.student-release .sr-home .next-row { display: grid; grid-template-columns: 132px minmax(0, 1fr) auto; gap: 20px; align-items: baseline; padding: 16px 0; color: var(--ink); }
.student-release .sr-home .next-row:first-child { padding-top: 10px; }
.student-release .sr-home .next-row:hover { text-decoration: none; }
.student-release .sr-home .next-row:hover .next-main b { color: var(--blue); }
.student-release .sr-home .next-date { display: flex; flex-direction: column; gap: 1px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.student-release .sr-home .next-date b { color: var(--ink); font-size: 14px; font-weight: 600; }
.student-release .sr-home .next-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; min-width: 0; }
.student-release .sr-home .next-main b { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.student-release .sr-home .next-main span { color: var(--muted); font-size: 13px; }
.student-release .sr-home .next-rel { justify-self: end; color: var(--muted); font-size: 13px; white-space: nowrap; }
.student-release .sr-home .next-rel[data-tone="overdue"] { color: var(--orange); font-weight: 600; }
.student-release .sr-home .next-rel[data-tone="soon"] { color: var(--blue); font-weight: 600; }

/* 最新评价：分数、来源与一句话 */
.student-release .sr-home .home-fb { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 28px; align-items: start; padding-top: 14px; color: var(--ink); }
.student-release .sr-home .home-fb:hover { text-decoration: none; }
.student-release .sr-home .home-fb:hover .home-fb-main b { color: var(--blue); }
.student-release .sr-home .home-fb-score { font-size: 32px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.student-release .sr-home .home-fb-score small { color: var(--muted); font-size: 13px; font-weight: 400; }
.student-release .sr-home .home-fb-main { display: grid; gap: 5px; min-width: 0; }
.student-release .sr-home .home-fb-main b { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.student-release .sr-home .home-fb-meta { color: var(--muted); font-size: 13px; }
.student-release .sr-home .home-fb-comment { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--muted); font-size: 14px; line-height: 1.6; }
.student-release .sr-home .home-empty { margin: 0; padding-top: 10px; color: var(--muted); font-size: 13px; }
.student-release .sr-home .home-empty a { color: var(--blue); }

@media (max-width: 767px) {
  .student-release .sr-home .home { gap: 40px; }
  .student-release .sr-home .explore-focus { padding: 22px 20px; }
  .student-release .sr-home .explore-focus h2 { font-size: 26px; }
  .student-release .sr-home .focus-foot { flex-direction: column; align-items: stretch; gap: 18px; }
  .student-release .sr-home .due { justify-items: start; text-align: left; }
  .student-release .sr-home .due-value { font-size: 24px; }
  .student-release .sr-home .focus-actions .button.primary { flex: 1 1 100%; }
  .student-release .sr-home .next-row { grid-template-columns: 88px minmax(0, 1fr); gap: 10px 16px; }
  .student-release .sr-home .next-rel { grid-column: 2; grid-row: 2; justify-self: start; }
  .student-release .sr-home .home-fb { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .student-release .sr-home .home-fb-score { font-size: 28px; }
}
</style>
