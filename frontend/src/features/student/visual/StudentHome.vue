<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { dashboardApi } from '../../../api'
import type { DashboardDTO } from '../../../api/dashboard'
import ApiState from '../../../components/ApiState.vue'
import ActionNotice from '../../../components/ActionNotice.vue'
import { usePageQuery } from '../../courses/use-page-query'
import { useOpenTarget } from '../../notifications/use-open-target'
import { useAuthStore } from '../../../stores/auth'
import { useNotificationsStore } from '../../../stores/notifications'
import HomeCurrentTask from './HomeCurrentTask.vue'
import { beijingAt, beijingHM, beijingMonthDay, greetingOf, HOME_TASK_STATES, homeStateKey, relDue } from './home-state'

// v4 首页：数据全部来自 getDashboard（currentLearning / otherPendingAssignments / courses /
// recentFeedback / recentNotice），首页不再逐项请求作业详情；能否提交由作业详情页判定。
const auth = useAuthStore()
const route = useRoute()
const target = useOpenTarget()
// 看板未读数作为快照写入外壳徽标：携带发起时版本号，迟到的看板响应不回退已被确认的值。
const badges = useNotificationsStore()
let dashboardSnapshotSeq = 0
const query = usePageQuery(async signal => {
  dashboardSnapshotSeq = badges.snapshotSeq()
  return (await dashboardApi().getDashboard({}, { signal })).data
})
watch(() => route.path, () => { void query.load() }, { immediate: true })
watch(() => query.data.value?.unreadMessageCount, value => {
  if (typeof value === 'number') badges.setUnread(value, dashboardSnapshotSeq)
})

const data = computed(() => query.data.value)
const greeting = computed(() => data.value ? greetingOf(data.value.serverTime) : '')
const displayName = computed(() => auth.identity?.displayName ?? '')
const current = computed(() => data.value?.currentLearning ?? null)
const others = computed(() => data.value?.otherPendingAssignments ?? [])
const courses = computed(() => data.value?.courses ?? [])
const termCourses = computed(() => {
  const termId = data.value?.termId
  const scoped = termId ? courses.value.filter(c => c.termId === termId) : courses.value
  return scoped.length > 0 ? scoped : courses.value
})
// 待办总数超过首页可见数（当前 1 + 其他 2）时给「全部 N 项」入口。
const showAllLink = computed(() => (data.value?.pendingAssignmentCount ?? 0) > others.value.length + (current.value !== null ? 1 : 0))
const courseTitleOf = (offeringId: string | null) => courses.value.find(c => c.offeringId === offeringId)?.title ?? ''
const otherRows = computed(() => {
  const now = data.value?.serverTime ?? ''
  return others.value.map(task => {
    const state = HOME_TASK_STATES[homeStateKey(task)]
    return { task, stateLabel: state.label, stateTone: state.tone, rel: relDue(task.dueAt, now) }
  })
})
</script>

<template>
  <div class="workspace-page sr-home" data-design="v4">
    <header class="page-head">
      <div>
        <h1 tabindex="-1">{{ greeting }}，{{ displayName }}</h1>
        <p v-if="query.status.value === 'success' && data?.termId === null" class="sr-intro">当前没有进行中的学期</p>
        <p v-else-if="query.status.value === 'success' && data" class="counts" aria-label="本学期概览">
          <RouterLink to="/student/assignments"><b>{{ data.pendingAssignmentCount }}</b> 项待完成</RouterLink>
          <RouterLink to="/course"><b>{{ data.courseCount }}</b> 门课程</RouterLink>
          <RouterLink to="/student/messages"><b>{{ data.unreadMessageCount }}</b> 条未读消息</RouterLink>
        </p>
      </div>
    </header>
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.status.value === 'success' && data">
      <div class="home-grid">
        <div class="col">
          <section class="sec" aria-labelledby="home-current-title">
            <div class="sec-h"><h2 id="home-current-title">当前任务</h2></div>
            <HomeCurrentTask :current="current" :courses="courses" :server-time="data.serverTime" />
          </section>

          <section class="sec" aria-labelledby="home-others-title">
            <div class="sec-h"><h2 id="home-others-title">其他待办</h2><RouterLink v-if="showAllLink" to="/student/assignments">全部 {{ data.pendingAssignmentCount }} 项</RouterLink></div>
            <ul v-if="otherRows.length" class="rows">
              <li v-for="row in otherRows" :key="row.task.id">
                <RouterLink class="row" :to="{ name: 'student-assignment', params: { id: row.task.id } }">
                  <div class="grow">
                    <b>{{ row.task.title }}</b>
                    <span class="meta">{{ courseTitleOf(row.task.offeringId) ? courseTitleOf(row.task.offeringId) + ' · ' : '' }}{{ beijingMonthDay(row.task.dueAt) }} {{ beijingHM(row.task.dueAt) }} 截止</span>
                  </div>
                  <span class="chip" :class="'st-' + row.stateTone">{{ row.stateLabel }}</span>
                  <span class="rel" :class="row.rel.tone">{{ row.rel.text }}</span>
                </RouterLink>
              </li>
            </ul>
            <p v-else class="meta">没有其他待办。</p>
          </section>

          <section class="sec" aria-labelledby="home-courses-title">
            <div class="sec-h"><h2 id="home-courses-title">课程</h2><RouterLink to="/course">全部课程</RouterLink></div>
            <ul v-if="termCourses.length" class="rows">
              <li v-for="c in termCourses" :key="c.offeringId">
                <RouterLink class="row" :to="{ name: 'course', params: { offeringId: c.offeringId } }">
                  <span class="mark" aria-hidden="true">{{ c.mark }}</span>
                  <div class="grow">
                    <b>{{ c.title }}</b>
                    <span class="meta">{{ c.currentChapter ? `第 ${c.currentChapter.number} 章 · ${c.currentChapter.title}` : '尚未开始' }}{{ c.pendingAssignmentCount ? ` · ${c.pendingAssignmentCount} 项待办` : '' }}{{ c.status === 'archived' ? ' · 已归档' : '' }}</span>
                  </div>
                  <div class="prog">
                    <div v-if="!c.progress.notConfigured" class="bar" role="progressbar" :aria-label="`${c.title} 章节进度`" :aria-valuenow="c.progress.percent" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: c.progress.percent + '%' }"></i></div>
                    <span class="meta num">{{ c.progress.notConfigured ? '未配置章节' : `${c.progress.completed}/${c.progress.total} 章` }}</span>
                  </div>
                </RouterLink>
              </li>
            </ul>
            <p v-else class="meta">本学期还没有课程。</p>
          </section>
        </div>

        <aside class="col side">
          <section class="sec" aria-labelledby="home-feedback-title">
            <div class="sec-h"><h2 id="home-feedback-title">最新评价</h2><RouterLink v-if="data.recentFeedback" :to="{ name: 'student-progress', params: { offeringId: data.recentFeedback.offeringId } }">学习记录</RouterLink></div>
            <RouterLink v-if="data.recentFeedback" class="fb" :to="{ name: 'student-assignment', params: { id: data.recentFeedback.assignmentId }, query: { feedbackId: data.recentFeedback.id } }">
              <div class="fb-top">
                <span class="score num">{{ data.recentFeedback.score }}<small>/{{ data.recentFeedback.maxScore }}</small></span>
                <div><b>{{ data.recentFeedback.assignmentTitle }}</b><span class="meta">{{ data.recentFeedback.teacher.displayName }} · {{ beijingAt(data.recentFeedback.publishedAt) }}</span></div>
              </div>
              <p>{{ data.recentFeedback.comment }}</p>
            </RouterLink>
            <p v-else class="meta">还没有已发布的评价。</p>
          </section>

          <section class="sec" aria-labelledby="home-notice-title">
            <div class="sec-h"><h2 id="home-notice-title">课程公告</h2><RouterLink to="/student/messages">全部消息</RouterLink></div>
            <ActionNotice :error="target.error.value" :message="null" />
            <div v-if="data.recentNotice" class="notice">
              <span class="meta">{{ courseTitleOf(data.recentNotice.offeringId) ? courseTitleOf(data.recentNotice.offeringId) + ' · ' : '' }}{{ beijingAt(data.recentNotice.createdAt) }}</span>
              <button v-if="data.recentNotice.target && target.canOpen(data.recentNotice.target)" class="notice-open" type="button" @click="target.open(data.recentNotice.target)">{{ data.recentNotice.title }}</button>
              <RouterLink v-else class="notice-open" to="/student/messages">{{ data.recentNotice.title }}</RouterLink>
              <p>{{ data.recentNotice.content }}</p>
            </div>
            <p v-else class="meta">暂无公告。</p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style>
/* v4 首页：页头 + 分区标题 + 分隔线 + 行列表；只有空态框带边框。选择器以 .student-release .sr-home 限定。 */
.student-release .sr-home .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-5); }
.student-release .sr-home .page-head h1 { font-size: var(--fs-h1); line-height: 1.3; font-weight: 700; }
.student-release .sr-home .sr-intro { margin-top: 4px; color: var(--muted); font-size: var(--fs-control); }
.student-release .sr-home .counts { display: flex; flex-wrap: wrap; gap: 6px 20px; margin-top: 4px; }
.student-release .sr-home .counts a { color: var(--muted); }
.student-release .sr-home .counts a:hover { color: var(--blue); text-decoration: none; }
.student-release .sr-home .counts b { margin-right: 3px; color: var(--ink); font-size: 17px; font-variant-numeric: tabular-nums; }
.student-release .sr-home .home-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 40px; align-items: start; }
.student-release .sr-home .col { display: grid; gap: var(--space-6); align-content: start; min-width: 0; }
.student-release .sr-home .col.side { gap: var(--space-5); }
.student-release .sr-home .sec-h { display: flex; align-items: baseline; gap: 12px; padding-bottom: 10px; margin-bottom: 4px; border-bottom: 1px solid var(--line); }
.student-release .sr-home .sec-h h2 { flex: 1; font-size: var(--fs-control); font-weight: 600; }
.student-release .sr-home .sec-h a { font-size: var(--fs-meta); }
.student-release .sr-home .rows { display: grid; list-style: none; margin: 0; padding: 0; }
.student-release .sr-home .row { display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 12px 4px; border-bottom: 1px solid var(--line); color: var(--ink); }
.student-release .sr-home .rows > li:last-child .row { border-bottom: 0; }
.student-release .sr-home a.row:hover { background: var(--surface); text-decoration: none; }
.student-release .sr-home .row b { display: block; font-size: var(--fs-control); font-weight: 600; overflow-wrap: anywhere; }
.student-release .sr-home .row .grow { flex: 1; min-width: 0; }
.student-release .sr-home .row .meta { display: block; }
.student-release .sr-home .meta { font-size: var(--fs-meta); color: var(--muted); }
.student-release .sr-home .num { font-variant-numeric: tabular-nums; }
/* 状态 chip：一个状态一个名字，颜色只是伴随 */
.student-release .sr-home .chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: 12px; font-size: var(--fs-micro); font-weight: 600; white-space: nowrap; }
.student-release .sr-home .chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.student-release .sr-home .st-todo { background: var(--blue-soft); color: var(--blue); }
.student-release .sr-home .st-late { background: var(--orange-soft); color: var(--orange); }
.student-release .sr-home .st-closed { background: var(--red-soft); color: var(--red); }
.student-release .sr-home .st-wait { background: var(--sunken); color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
.student-release .sr-home .st-done { background: var(--green-soft); color: var(--green); }
.student-release .sr-home .rel { font-size: var(--fs-meta); color: var(--muted); white-space: nowrap; }
.student-release .sr-home .rel.urgent { color: var(--orange); font-weight: 600; }
.student-release .sr-home .rel.late { color: var(--orange); }
/* 课程行 */
.student-release .sr-home .mark { width: 40px; height: 40px; flex: none; border-radius: var(--radius-control); background: var(--sunken); border: 1px solid var(--line); display: grid; place-items: center; font: 600 var(--fs-micro) var(--font-mono); color: var(--muted); letter-spacing: .5px; }
.student-release .sr-home .prog { display: grid; gap: 4px; justify-items: end; width: 140px; flex: none; }
.student-release .sr-home .bar { width: 100%; height: 4px; border-radius: 2px; background: var(--line); overflow: hidden; }
.student-release .sr-home .bar i { display: block; height: 100%; background: var(--blue); }
/* 侧栏：评价与公告 */
.student-release .sr-home .fb { display: block; color: var(--ink); padding-top: 12px; }
.student-release .sr-home .fb:hover { text-decoration: none; }
.student-release .sr-home .fb:hover b { color: var(--blue); }
.student-release .sr-home .fb-top { display: flex; gap: 14px; align-items: center; margin-bottom: 8px; }
.student-release .sr-home .fb-top b { display: block; font-size: var(--fs-control); }
.student-release .sr-home .fb p, .student-release .sr-home .notice p { font-size: var(--fs-control); color: var(--muted); }
.student-release .sr-home .score { font: 600 22px/1 var(--font-sans); font-variant-numeric: tabular-nums; }
.student-release .sr-home .score small { font-size: var(--fs-meta); color: var(--muted); font-weight: 400; }
.student-release .sr-home .notice { display: grid; gap: 4px; padding-top: 12px; font-size: var(--fs-control); }
.student-release .sr-home .notice-open { padding: 0; border: 0; background: none; color: var(--ink); font: 600 var(--fs-control) var(--font-sans); text-align: left; cursor: pointer; }
.student-release .sr-home .notice-open:hover { color: var(--blue); }
@media (max-width: 1100px) {
  .student-release .sr-home .home-grid { grid-template-columns: 1fr; gap: 32px; }
}
@media (max-width: 860px) {
  .student-release .sr-home .page-head { flex-direction: column; align-items: stretch; }
  .student-release .sr-home .page-head h1 { font-size: var(--fs-h1-sm); }
  .student-release .sr-home .prog { width: 96px; }
}
</style>
