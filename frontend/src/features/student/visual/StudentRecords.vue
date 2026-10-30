<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { coursesApi, dashboardApi } from '../../../api'
import type { LearningRecordsDTO } from '../../../api/dashboard'
import { allPages } from '../../../api/pagination'
import ApiState from '../../../components/ApiState.vue'
import UiEmptyState from '../../../components/ui/UiEmptyState.vue'
import UiPager from '../../../components/ui/UiPager.vue'
import UiSelect from '../../../components/ui/UiSelect.vue'
import { usePageQuery } from '../../../features/courses/use-page-query'
import { formatTime } from '../../../features/courses/format'
import { isUuid } from '../../../features/assignments/format'
import { byRecentStudy } from '../../../features/assignments/task-presentation'
import { targetRoute } from '../../../features/notifications/target-route'

type KnowledgeAssessment = LearningRecordsDTO['knowledgeEvidence'][number]
type EvidenceResult = KnowledgeAssessment['evidence'][number]['result']

const route = useRoute()
const router = useRouter()
const dashApi = dashboardApi()
const courses = coursesApi()
const PAGE_SIZE = 10
const STATE_ORDER: KnowledgeAssessment['assessmentState'][] = ['needs_practice', 'learning', 'insufficient_evidence', 'basically_mastered']
const ASSESSMENT_LABELS: Record<KnowledgeAssessment['assessmentState'], string> = {
  basically_mastered: '基本掌握',
  needs_practice: '需要练习',
  learning: '学习中',
  insufficient_evidence: '证据不足',
}
const FRESHNESS_LABELS: Record<KnowledgeAssessment['freshness'], string> = {
  fresh: '证据较新',
  stale: '证据超过 30 天',
  none: '暂无证据',
}
const RESULT_LABELS: Record<EvidenceResult, string> = {
  meets_expectation: '达到预期',
  needs_practice: '需要练习',
  insufficient_evidence: '证据不足',
}

const rawId = computed(() => route.params['offeringId'])
const selecting = computed(() => rawId.value === undefined)
const invalidLink = computed(() => !selecting.value && !isUuid(rawId.value))
const page = computed(() => {
  const value = Number(route.query['page'])
  return Number.isInteger(value) && value >= 1 && value <= 2147483647 ? value : 1
})

const offeringsQuery = usePageQuery(async signal => ({items:(await allPages((page,pageSize,signal)=>courses.listMyCourses({status:'all',page,pageSize},{signal}).then(r=>r.data),signal)).sort(byRecentStudy)}))
void offeringsQuery.load()
const currentCourse = computed(() => offeringsQuery.data.value?.items.find(c => c.offeringId === rawId.value))
const selectedCourseId = computed(() => typeof rawId.value === 'string' ? rawId.value : '')
const courseOptions = computed(() => [
  ...(selecting.value || !currentCourse.value ? [{ value: '', label: '选择课程' }] : []),
  ...(offeringsQuery.data.value?.items ?? []).map(course => ({ value: course.offeringId, label: course.title, hint: course.groupName })),
])
const courseProgress = computed(() => {
  const progress = currentCourse.value?.progress
  return progress && !progress.notConfigured && progress.total > 0 ? { completed: progress.completed, total: progress.total } : null
})

const recordsQuery = usePageQuery(async signal => {
  if (!isUuid(rawId.value)) throw new Error('链接无效')
  return (await dashApi.getMyLearningRecords(rawId.value, { page: page.value, pageSize: PAGE_SIZE }, { signal })).data
})
watch(() => offeringsQuery.data.value, async value => {
  if (selecting.value && value?.items[0]) await router.replace({ name: 'student-progress', params: { offeringId: value.items[0].offeringId } })
})
watch(() => route.fullPath, async () => {
  if (selecting.value) {
    const items = offeringsQuery.data.value?.items ?? []
    if (offeringsQuery.status.value === 'success' && items[0]) {
      await router.replace({ name: 'student-progress', params: { offeringId: items[0].offeringId } })
    }
  } else if (!invalidLink.value) {
    await recordsQuery.load()
  }
}, { immediate: true })

const records = computed(() => recordsQuery.data.value)
const restricted = computed(() => {
  const kind = recordsQuery.error.value?.kind
  return recordsQuery.status.value === 'error' && (kind === 'forbidden' || kind === 'not-found')
})
const knowledge = computed(() => [...(records.value?.knowledgeEvidence ?? [])]
  .sort((a, b) => STATE_ORDER.indexOf(a.assessmentState) - STATE_ORDER.indexOf(b.assessmentState)))
const OVERVIEW_ORDER: KnowledgeAssessment['assessmentState'][] = ['basically_mastered', 'learning', 'needs_practice', 'insufficient_evidence']
const masteryLegend = computed(() => OVERVIEW_ORDER.map(state => ({
  state,
  label: ASSESSMENT_LABELS[state],
  count: knowledge.value.filter(item => item.assessmentState === state).length,
})))
const masterySegments = computed(() => masteryLegend.value.filter(segment => segment.count > 0))
const feedbackItems = computed(() => records.value?.feedbackPage.items ?? [])
const totalPages = computed(() => Math.max(1, Math.ceil((records.value?.feedbackPage.total ?? 0) / PAGE_SIZE)))
const recommendationLink = computed(() => {
  const target = records.value?.nextRecommendation?.target ?? null
  if (target === null) return null
  const routeTo = targetRoute(target)
  return typeof routeTo === 'string' || routeTo === null ? null : routeTo
})

function goToPage(next: number): void {
  if (next < 1 || next > totalPages.value) return
  void router.push({ query: { ...route.query, page: String(next) } })
}
function chooseCourse(offeringId: string): void {
  if (!offeringId || offeringId === selectedCourseId.value) return
  void router.push({ name: 'student-progress', params: { offeringId } })
}
</script>

<template>
  <div class="workspace-page sr-records">
    <header class="page-head">
      <div>
        <h1 class="page-title" tabindex="-1">学习记录</h1>
        <p class="page-summary">掌握判断只依据已批阅作业里的知识点评价，不代表考试成绩。</p>
      </div>
      <div class="page-actions">
        <UiSelect :model-value="selectedCourseId" :options="courseOptions" :disabled="offeringsQuery.status.value !== 'success'" aria-label="课程" @update:model-value="chooseCourse" />
      </div>
    </header>

    <ApiState v-if="offeringsQuery.status.value === 'error'" :status="offeringsQuery.status.value" :error="offeringsQuery.error.value" @retry="offeringsQuery.load" />
    <UiEmptyState v-else-if="invalidLink || restricted" role="alert" title="无法查看该教学班的学习记录" :description="invalidLink ? '链接无效，请从课程列表重新进入。' : '目标不是你可查看的教学班。'">
      <RouterLink class="button secondary" to="/student/progress">返回学习记录</RouterLink>
    </UiEmptyState>
    <UiEmptyState v-else-if="offeringsQuery.status.value === 'success' && !offeringsQuery.data.value?.items.length" title="学习足迹，从第一门课程开始。" description="尚未加入教学班，请前往课程页了解课程。">
      <RouterLink class="button secondary" to="/course">查看我的课程 →</RouterLink>
    </UiEmptyState>
    <template v-else-if="!selecting">
      <ApiState :status="recordsQuery.status.value" :error="recordsQuery.error.value" @retry="recordsQuery.load" />
      <template v-if="recordsQuery.status.value === 'success' && records">
        <dl class="stats vx-results" aria-label="学习概览">
          <div><dt>章节进度</dt><dd><template v-if="courseProgress"><b>{{ courseProgress.completed }}</b>/{{ courseProgress.total }}</template><span v-else class="stat-note">未配置</span></dd></div>
          <div><dt>已完成实验</dt><dd><b>{{ records.summary.completedLabCount ?? 0 }}</b><small>个</small></dd></div>
          <div><dt>已发布评价</dt><dd><b>{{ records.summary.publishedFeedbackCount ?? 0 }}</b><small>份</small></dd></div>
          <div><dt>需要练习的知识点</dt><dd><template v-if="records.summary.needsPracticeCount !== null"><b>{{ records.summary.needsPracticeCount }}</b></template><span v-else class="stat-note">未配置</span></dd></div>
        </dl>

        <section v-if="records.nextRecommendation" class="reco" aria-labelledby="reco-title">
          <div class="reco-main">
            <p class="eyebrow">下一步</p>
            <h2 id="reco-title">{{ records.nextRecommendation.title }}</h2>
            <p>{{ records.nextRecommendation.reason }}</p>
          </div>
          <RouterLink v-if="recommendationLink !== null" class="button primary" :to="recommendationLink">去复习</RouterLink>
        </section>

        <div class="records-grid">
          <section class="col knowledge" aria-labelledby="knowledge-title">
            <div class="col-head">
              <h2 id="knowledge-title">知识点</h2>
              <span v-if="knowledge.length" class="meta">规则 {{ knowledge[0]?.ruleVersion }} · {{ formatTime(knowledge[0]!.asOf) }} 计算</span>
            </div>
            <p v-if="!knowledge.length" class="col-empty">这门课没有配置知识点。教师给作业关联知识点并发布评价后，这里会显示掌握情况。</p>
            <template v-else>
              <div class="mastery-overview" aria-label="知识点掌握概览">
                <div class="mastery-bar" aria-hidden="true">
                  <span v-for="segment in masterySegments" :key="segment.state" :data-state="segment.state" :style="{ flexGrow: segment.count }"></span>
                </div>
                <ul class="mastery-legend">
                  <li v-for="segment in masteryLegend" :key="segment.state" :data-state="segment.state"><i aria-hidden="true"></i>{{ segment.label }}<b>{{ segment.count }}</b></li>
                </ul>
                <p class="mastery-note">共 {{ knowledge.length }} 个知识点，颜色越深表示掌握程度越高。</p>
              </div>
              <div class="kp-list">
                <details v-for="item in knowledge" :key="item.knowledgePointId" class="kp">
                  <summary>
                    <span class="kstate" :data-state="item.assessmentState">{{ ASSESSMENT_LABELS[item.assessmentState] }}</span>
                    <b>{{ item.title }}</b>
                    <span class="meta">{{ item.evidenceCount }} 条证据 · {{ FRESHNESS_LABELS[item.freshness] }}</span>
                  </summary>
                  <div class="kp-body">
                    <p>{{ item.explanation }}</p>
                    <ul v-if="item.evidence.length" class="kp-evidence">
                      <li v-for="evidence in item.evidence" :key="evidence.id">
                        <span class="kres" :data-result="evidence.result">{{ RESULT_LABELS[evidence.result] }}</span>
                        <RouterLink :to="{ name: 'student-assignment', params: { id: evidence.assignmentId }, query: { feedbackId: evidence.feedbackId } }">{{ evidence.assignmentTitle }}</RouterLink>
                        <span class="meta">{{ formatTime(evidence.occurredAt) }}<template v-if="evidence.note"> · {{ evidence.note }}</template></span>
                      </li>
                    </ul>
                  </div>
                </details>
              </div>
            </template>
          </section>

          <section class="col feedback vx-feedback" aria-labelledby="feedback-title">
            <div class="col-head">
              <h2 id="feedback-title">评价历史</h2>
              <span class="meta">{{ records.feedbackPage.total }} 份</span>
            </div>
            <p v-if="!feedbackItems.length" class="col-empty">还没有已发布的评价。</p>
            <template v-else>
              <ul class="fb-rows">
                <li v-for="item in feedbackItems" :key="item.id">
                  <RouterLink class="fb-row" :class="{ 'is-recent': item.id === records.recentFeedback?.id }" :to="{ name: 'student-assignment', params: { id: item.assignmentId }, query: { feedbackId: item.id } }">
                    <span class="fb-score">{{ item.score }}<small>/{{ item.maxScore }}</small></span>
                    <div class="fb-main">
                      <b>{{ item.assignmentTitle }}</b>
                      <span class="meta">{{ item.teacher.displayName }} · {{ formatTime(item.publishedAt) }}</span>
                      <p class="fb-comment">{{ item.comment }}</p>
                    </div>
                  </RouterLink>
                </li>
              </ul>
              <UiPager :page="page" :total="totalPages" label="评价历史分页" :meta="`第 ${page} / ${totalPages} 页`" @update:page="goToPage" />
            </template>
          </section>
        </div>
      </template>
    </template>
  </div>
</template>
