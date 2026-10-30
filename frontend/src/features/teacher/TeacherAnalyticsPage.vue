<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { EChartsCoreOption } from 'echarts/core'
import { statsApi } from '../../api'
import type { OfferingActivityDTO, OfferingKnowledgeMasteryDTO } from '../../api/stats'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'
import { formatTime } from '../courses/format'
import { isUuid } from '../assignments/format'
import UiChart from './analytics/UiChart.vue'
import {
  ACTIVITY_FIELDS, DISTRIBUTION_FIELDS, MASTERY_LABELS, MASTERY_ORDER,
  activityEventTotal, analyticsColors, escapeHtml, formatPercent, prefersReducedMotion,
} from './analytics/presentation'

type ActivityDay = OfferingActivityDTO['days'][number]
type MasteryItem = OfferingKnowledgeMasteryDTO['items'][number]

const route = useRoute()
const auth = useAuthStore()
const api = statsApi()

const id = computed(() => {
  const value = route.params.id
  return typeof value === 'string' && isUuid(value) ? value : ''
})
const valid = computed(() => id.value !== '')

const { data: activityData, status: activityStatus, error: activityError, load: loadActivity } = usePageQuery(async signal => {
  if (!valid.value) throw new Error('链接无效')
  return (await api.getOfferingActivity(id.value, { signal })).data
})
const { data: masteryData, status: masteryStatus, error: masteryError, load: loadMastery } = usePageQuery(async signal => {
  if (!valid.value) throw new Error('链接无效')
  return (await api.getOfferingKnowledgeMastery(id.value, { signal })).data
})

watch(id, () => {
  if (!valid.value) return
  void loadActivity()
  void loadMastery()
}, { immediate: true })
watch(() => auth.identity?.id, () => {
  if (!valid.value) return
  void loadActivity()
  void loadMastery()
})

const totalEvents = computed(() => activityData.value === null ? 0 : activityEventTotal(activityData.value.totals))
const activityEmpty = computed(() => activityStatus.value === 'success' && totalEvents.value === 0)
const activitySummary = computed(() => {
  const data = activityData.value
  if (data === null) return ''
  const top = ACTIVITY_FIELDS
    .map(([field, label]) => ({ label, count: data.totals[field] }))
    .sort((left, right) => right.count - left.count)[0]
  const suffix = top !== undefined && top.count > 0 ? `；${top.label}最多（${top.count} 次）` : ''
  return `14 天共 ${data.totals.activeStudentCount} 名学生活跃，产生 ${totalEvents.value} 次学习事件${suffix}。`
})
const activityLabel = computed(() => `最近 14 天学习活跃度图表。${activitySummary.value}`)

function paramIndex(params: unknown): number | null {
  const first = Array.isArray(params) ? params[0] : params
  const index = first !== null && typeof first === 'object' && 'dataIndex' in first
    ? (first as { dataIndex?: unknown }).dataIndex
    : undefined
  return typeof index === 'number' && Number.isInteger(index) ? index : null
}

function activityTooltip(params: unknown): string {
  const index = paramIndex(params)
  const day: ActivityDay | undefined = index === null ? undefined : activityData.value?.days[index]
  if (day === undefined) return ''
  const rows = ACTIVITY_FIELDS
    .filter(([field]) => day[field] > 0)
    .map(([field, label]) => `${escapeHtml(label)} ${day[field]}`)
  return `${day.date} · 活跃 ${day.activeStudentCount} 人<br/>${rows.length === 0 ? '无学习事件' : rows.join('<br/>')}`
}

const activityOption = computed<EChartsCoreOption>(() => {
  const colors = analyticsColors()
  const days = activityData.value?.days ?? []
  return {
    animation: !prefersReducedMotion(),
    color: [colors.blue, colors.ink],
    grid: { left: 8, right: 12, top: 36, bottom: 4, containLabel: true },
    legend: {
      top: 0, left: 0, itemWidth: 10, itemHeight: 10,
      textStyle: { color: colors.muted, fontSize: 12 },
      data: ['学习事件', '活跃学生'],
    },
    tooltip: {
      trigger: 'axis',
      borderColor: colors.line,
      textStyle: { color: colors.ink, fontSize: 12 },
      formatter: activityTooltip,
    },
    xAxis: {
      type: 'category',
      data: days.map(day => day.date.slice(5)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: colors.line } },
      axisLabel: { color: colors.muted, fontSize: 12 },
    },
    yAxis: [
      {
        type: 'value', minInterval: 1,
        axisLabel: { color: colors.muted, fontSize: 12 },
        splitLine: { lineStyle: { color: colors.line } },
      },
      {
        type: 'value', minInterval: 1,
        axisLabel: { color: colors.muted, fontSize: 12 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '学习事件', type: 'bar', barMaxWidth: 18,
        data: days.map(day => activityEventTotal(day)),
        itemStyle: { color: colors.blue },
      },
      {
        name: '活跃学生', type: 'line', yAxisIndex: 1, symbolSize: 6,
        data: days.map(day => day.activeStudentCount),
        lineStyle: { color: colors.ink, width: 2 },
        itemStyle: { color: colors.ink },
      },
    ],
  }
})

const masteryItems = computed<MasteryItem[]>(() => masteryData.value?.items ?? [])
const masteryDistribution = computed(() => masteryData.value?.summary.distribution ?? null)
const masterySegments = computed(() => MASTERY_ORDER.map(state => ({
  state,
  label: MASTERY_LABELS[state],
  count: masteryDistribution.value?.[DISTRIBUTION_FIELDS[state]] ?? 0,
})))
const masteryRate = computed(() => formatPercent(masteryData.value?.summary.masteryRate))
const masteryHeight = computed(() => Math.min(440, Math.max(170, masteryItems.value.length * 48 + 24)))
const masteryEmpty = computed<{ title: string; description: string } | null>(() => {
  const data = masteryData.value
  if (data === null) return null
  if (data.studentCount === 0) return { title: '班级暂无学生', description: '学生加入教学班后，这里会按知识点汇总掌握分布。' }
  if (data.knowledgePointCount === 0) return { title: '还没有配置知识点', description: '在章节中关联知识点并发布后，这里会显示全班掌握分布。' }
  if (data.assessedStudentCount === 0) return { title: '还没有知识点证据', description: '批阅作业并留下知识点评价后，这里会显示掌握分布。' }
  return null
})
const masterySummary = computed(() => {
  const data = masteryData.value
  if (data === null) return ''
  const counts = masterySegments.value.map(segment => `${segment.label} ${segment.count}`).join('，')
  return `共 ${data.summary.assessmentCount} 个学生与知识点组合：${counts}；基本掌握率 ${masteryRate.value}。`
})
const masteryLabel = computed(() => `知识点掌握分布图表。${masterySummary.value}`)

function masteryTooltip(params: unknown): string {
  const index = paramIndex(params)
  const item: MasteryItem | undefined = index === null ? undefined : masteryItems.value[index]
  if (item === undefined) return ''
  const rows = MASTERY_ORDER.map(state => `${MASTERY_LABELS[state]} ${item.distribution[DISTRIBUTION_FIELDS[state]]}`)
  return `${escapeHtml(item.title)}<br/>${rows.join('<br/>')}<br/>已有教师证据 ${item.assessedStudentCount} 人`
}

const masteryOption = computed<EChartsCoreOption>(() => {
  const colors = analyticsColors()
  return {
    animation: !prefersReducedMotion(),
    grid: { left: 8, right: 12, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      borderColor: colors.line,
      textStyle: { color: colors.ink, fontSize: 12 },
      formatter: masteryTooltip,
    },
    xAxis: {
      type: 'value', minInterval: 1, max: masteryData.value?.studentCount,
      axisLabel: { color: colors.muted, fontSize: 12 },
      splitLine: { lineStyle: { color: colors.line } },
    },
    yAxis: {
      type: 'category',
      data: masteryItems.value.map(item => item.title),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: colors.line } },
      axisLabel: { color: colors.ink, fontSize: 12, width: 150, overflow: 'truncate' },
    },
    series: MASTERY_ORDER.map(state => ({
      name: MASTERY_LABELS[state],
      type: 'bar',
      stack: 'mastery',
      barMaxWidth: 18,
      itemStyle: { color: colors.mastery[state] },
      emphasis: { focus: 'series' },
      data: masteryItems.value.map(item => item.distribution[DISTRIBUTION_FIELDS[state]]),
    })),
  }
})
</script>

<template>
  <div class="workspace-page teacher-page teacher-analytics">
    <RouterLink v-if="valid" class="teacher-back" :to="{ name: 'teacher-offering', params: { id } }">返回教学班工作台</RouterLink>
    <RouterLink v-else class="teacher-back" to="/teacher">返回授课教学班</RouterLink>
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">学习分析</h1>
        <p>最近 14 天的学习行为与全班知识点掌握分布。结论只依据平台内已发生的行为和已批阅评价。</p>
      </div>
      <RouterLink v-if="valid" class="button secondary" :to="{ name: 'teacher-assignments', params: { offeringId: id } }">作业管理</RouterLink>
    </header>

    <p v-if="!valid" class="notice notice-warn" role="alert">链接无效，请从教学班工作台重新进入。</p>
    <template v-else>
      <section class="surface analytics-section" aria-labelledby="analytics-activity-title">
        <header class="analytics-heading">
          <div>
            <h2 id="analytics-activity-title">学习活跃度</h2>
            <p v-if="activityData">{{ activityData.from }} 至 {{ activityData.to }}</p>
          </div>
        </header>
        <ApiState :status="activityStatus" :error="activityError" @retry="loadActivity" />
        <template v-if="activityStatus === 'success' && activityData">
          <dl class="analytics-stats" aria-label="学习活跃度汇总">
            <div><dt>活跃学生</dt><dd>{{ activityData.totals.activeStudentCount }}<small>人</small></dd></div>
            <div><dt>学习事件</dt><dd>{{ totalEvents }}<small>次</small></dd></div>
            <div><dt>作业提交</dt><dd>{{ activityData.totals.assignmentSubmittedCount }}<small>次</small></dd></div>
            <div><dt>AI 辅导完成</dt><dd>{{ activityData.totals.tutoringCompletedCount }}<small>次</small></dd></div>
          </dl>
          <div v-if="activityEmpty" class="analytics-empty">
            <h3>最近 14 天还没有学习行为</h3>
            <p>学生打开章节、保存工作区或提交作业后，这里会显示每日趋势。</p>
          </div>
          <template v-else>
            <p class="analytics-summary">{{ activitySummary }}</p>
            <UiChart :option="activityOption" :label="activityLabel" :height="260" />
          </template>
        </template>
      </section>

      <section class="surface analytics-section" aria-labelledby="analytics-mastery-title">
        <header class="analytics-heading">
          <div>
            <h2 id="analytics-mastery-title">知识点掌握</h2>
            <p v-if="masteryData">{{ masteryData.studentCount }} 名学生 · {{ masteryData.knowledgePointCount }} 个知识点 · 规则 {{ masteryData.ruleVersion }}</p>
          </div>
          <span v-if="masteryData" class="analytics-meta">计算于 {{ formatTime(masteryData.asOf) }}</span>
        </header>
        <ApiState :status="masteryStatus" :error="masteryError" @retry="loadMastery" />
        <template v-if="masteryStatus === 'success' && masteryData">
          <dl class="analytics-stats" aria-label="知识点掌握汇总">
            <div><dt>学生</dt><dd>{{ masteryData.studentCount }}<small>人</small></dd></div>
            <div><dt>知识点</dt><dd>{{ masteryData.knowledgePointCount }}<small>个</small></dd></div>
            <div><dt>已有教师证据</dt><dd>{{ masteryData.assessedStudentCount }}<small>人</small></dd></div>
            <div><dt>基本掌握率</dt><dd>{{ masteryRate }}<small>展示用</small></dd></div>
          </dl>
          <div v-if="masteryEmpty" class="analytics-empty">
            <h3>{{ masteryEmpty.title }}</h3>
            <p>{{ masteryEmpty.description }}</p>
          </div>
          <template v-else>
            <ul class="mastery-legend" aria-label="掌握状态分布">
              <li v-for="segment in masterySegments" :key="segment.state">
                <i :data-state="segment.state" aria-hidden="true"></i>{{ segment.label }}<b>{{ segment.count }}</b>
              </li>
            </ul>
            <p class="analytics-summary">{{ masterySummary }}</p>
            <UiChart :option="masteryOption" :label="masteryLabel" :height="masteryHeight" />
            <details class="mastery-details">
              <summary>各知识点明细（{{ masteryItems.length }} 个）</summary>
              <ul>
                <li v-for="item in masteryItems" :key="item.knowledgePointId">
                  <strong>{{ item.title }}</strong>
                  <span v-for="segment in MASTERY_ORDER" :key="segment">
                    {{ MASTERY_LABELS[segment] }} {{ item.distribution[DISTRIBUTION_FIELDS[segment]] }}
                  </span>
                </li>
              </ul>
            </details>
            <p class="analytics-note">掌握判断只依据已批阅作业里的知识点评价，不代表考试成绩；基本掌握率仅用于展示，不是成绩。</p>
          </template>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.analytics-section {
  padding: 22px 26px;
  margin-bottom: 20px;
}
.analytics-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.analytics-heading h2 {
  font-size: 18px;
  margin: 0;
}
.analytics-heading p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.analytics-meta {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.analytics-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 20px;
  margin: 0 0 16px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.analytics-stats div {
  min-width: 0;
}
.analytics-stats dt {
  font-size: 12px;
  color: var(--muted);
}
.analytics-stats dd {
  margin: 4px 0 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.analytics-stats dd small {
  margin-left: 3px;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.analytics-summary {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 1.7;
}
.analytics-note {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
}
.analytics-empty {
  padding: 26px 0 10px;
}.analytics-empty h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.analytics-empty p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--muted);
}
.mastery-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--muted);
}
.mastery-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mastery-legend i {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.mastery-legend b {
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.mastery-legend i[data-state='basically_mastered'] { background: var(--mastery-4); }
.mastery-legend i[data-state='learning'] { background: var(--mastery-3); }
.mastery-legend i[data-state='needs_practice'] { background: var(--mastery-2); }
.mastery-legend i[data-state='insufficient_evidence'] { background: var(--mastery-1); }
.mastery-details {
  margin-top: 10px;
  border-top: 1px solid var(--line);
}
.mastery-details summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--blue-text);
  cursor: pointer;
}
.mastery-details ul {
  list-style: none;
  margin: 0;
  padding: 0 0 6px;
}
.mastery-details li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.mastery-details strong {
  flex: 1 1 160px;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  overflow-wrap: anywhere;
}
@media (max-width: 650px) {
  .analytics-section { padding: 18px; }
  .analytics-heading { flex-wrap: wrap; gap: 4px; }
  .analytics-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
