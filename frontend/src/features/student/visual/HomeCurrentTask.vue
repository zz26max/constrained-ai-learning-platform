<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { coursesApi, tutoringApi } from '../../../api'
import type { DashboardDTO } from '../../../api/dashboard'
import { usePageQuery } from '../../courses/use-page-query'
import {
  beijingAt, beijingHM, beijingMonthDay, beijingWeekday, homeStateKey, HOME_TASK_STATES, relDue,
} from './home-state'

type Current = NonNullable<DashboardDTO['currentLearning']>
type CourseRow = DashboardDTO['courses'][number]

const props = defineProps<{ current: Current | null; courses: CourseRow[]; serverTime: string }>()

const courseTitle = computed(() => props.current ? props.courses.find(c => c.offeringId === props.current?.offeringId)?.title ?? '' : '')
const assignment = computed(() => props.current?.type === 'assignment' ? props.current : null)
const chapterCurrent = computed(() => props.current?.type === 'chapter' ? props.current : null)

// 章节眉标增强：CurrentAssignment 只有 chapterId，没有章节号与标题；用既有 listChapters
// 解析一次，失败时静默降级为只显示课程名（不是缺失字段，不伪造文案）。
const chaptersQuery = usePageQuery(async signal => {
  const offeringId = assignment.value?.offeringId
  if (!offeringId) throw new Error('没有章节上下文')
  return (await coursesApi().listChapters(offeringId, { signal })).data
})
watch(() => assignment.value?.chapterId, chapterId => { if (chapterId) void chaptersQuery.load() }, { immediate: true })
const chapterLabel = computed(() => {
  const chapterId = assignment.value?.chapterId
  if (!chapterId) return ''
  const found = chaptersQuery.data.value?.items.find(item => item.id === chapterId)
  return found ? `第 ${found.number} 章 · ${found.title}` : ''
})

// AI 辅导按钮按政策开关显示；读取失败时隐藏，不在首页宣传未开启的功能。
const policyQuery = usePageQuery(async signal => {
  const assignmentId = assignment.value?.assignmentId
  if (!assignmentId) throw new Error('没有作业上下文')
  return (await tutoringApi().getAiPolicy(assignmentId, { signal })).data
})
watch(() => assignment.value?.assignmentId, assignmentId => { if (assignmentId) void policyQuery.load() }, { immediate: true })
const aiEnabled = computed(() => policyQuery.data.value?.enabled === true)

const state = computed(() => assignment.value ? HOME_TASK_STATES[homeStateKey(assignment.value)] : null)
const rel = computed(() => assignment.value ? relDue(assignment.value.dueAt, props.serverTime) : null)
</script>

<template>
  <!-- 无待完成作业：给课程入口，不假装有任务 -->
  <div v-if="current === null" class="sr-empty">
    <b>没有待完成的作业</b>
    <p>可以继续阅读课程章节。</p>
    <RouterLink class="button" data-home-action="primary" :to="{ name: 'courses' }">我的课程</RouterLink>
  </div>

  <!-- 章节型当前学习：继续阅读 -->
  <div v-else-if="chapterCurrent" class="current">
    <div class="eyebrow">{{ courseTitle }}</div>
    <h3><RouterLink :to="{ name: 'chapter', params: { offeringId: chapterCurrent.offeringId, chapterId: chapterCurrent.chapterId } }">{{ chapterCurrent.title }}</RouterLink></h3>
    <p class="desc">{{ chapterCurrent.description }}</p>
    <div class="actions">
      <RouterLink class="button primary" data-home-action="primary" :to="{ name: 'chapter', params: { offeringId: chapterCurrent.offeringId, chapterId: chapterCurrent.chapterId } }">继续阅读 →</RouterLink>
    </div>
  </div>

  <!-- 作业型当前任务 -->
  <div v-else-if="assignment" class="current">
    <div class="eyebrow">{{ courseTitle }}<template v-if="chapterLabel"> · {{ chapterLabel }}</template></div>
    <h3><RouterLink :to="{ name: 'student-assignment', params: { id: assignment.assignmentId } }">{{ assignment.title }}</RouterLink></h3>
    <p class="desc">{{ assignment.description }}</p>
    <dl class="facts">
      <div><dt>截止</dt><dd>{{ beijingMonthDay(assignment.dueAt) }} {{ beijingWeekday(assignment.dueAt) }} {{ beijingHM(assignment.dueAt) }} <span class="rel" :class="rel?.tone">{{ rel?.text }}</span></dd></div>
      <div><dt>状态</dt><dd><span class="chip" :class="'st-' + state?.tone">{{ state?.label }}</span></dd></div>
      <div><dt>上次保存</dt><dd>{{ assignment.resume ? `${beijingAt(assignment.resume.savedAt)} · ${assignment.resume.activeFile}` : '还没有开始' }}</dd></div>
    </dl>
    <div class="actions">
      <!-- 逾期项列表语义拿不到 canSubmit：不直接承诺补交，去详情页由服务端确认 -->
      <RouterLink v-if="assignment.overdue" class="button primary" data-home-action="primary" :to="{ name: 'student-assignment', params: { id: assignment.assignmentId } }">查看能否补交</RouterLink>
      <template v-else>
        <RouterLink class="button primary" data-home-action="primary" :to="{ name: 'student-workspace', params: { id: assignment.assignmentId } }">{{ assignment.resume ? '继续作答' : '开始作答' }} →</RouterLink>
        <RouterLink v-if="aiEnabled" class="button" :to="{ name: 'student-tutoring', params: { id: assignment.assignmentId } }">AI 辅导</RouterLink>
        <RouterLink class="button ghost" :to="{ name: 'student-assignment', params: { id: assignment.assignmentId } }">查看要求</RouterLink>
      </template>
    </div>
    <p v-if="assignment.overdue" class="meta note">这项作业已过截止时间。能否补交、补交截止到什么时候，以作业详情页的服务端判定为准。</p>
  </div>
</template>

<style scoped>
.current { padding-top: 14px; }
.eyebrow { font-size: var(--fs-meta); color: var(--muted); }
.current h3 { font-size: var(--fs-title); line-height: 1.35; margin: 4px 0 6px; font-weight: 600; }
.current h3 a { color: var(--ink); }
.current .desc { color: var(--muted); font-size: var(--fs-control); max-width: 640px; }
.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 24px; margin: 18px 0; padding: 14px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.facts dt { font-size: var(--fs-meta); color: var(--muted); }
.facts dd { font-size: var(--fs-control); display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; margin: 2px 0 0; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.meta { font-size: var(--fs-meta); color: var(--muted); }
.note { margin-top: 12px; max-width: 640px; }
.sr-empty { padding: 36px 20px; text-align: center; border: 1px dashed var(--line-strong); border-radius: var(--radius-panel); }
.sr-empty b { display: block; font-size: var(--fs-body); margin-bottom: 4px; }
.sr-empty p { color: var(--muted); font-size: var(--fs-control); margin: 0 0 14px; }
@media (max-width: 860px) { .facts { grid-template-columns: 1fr; } }
</style>
