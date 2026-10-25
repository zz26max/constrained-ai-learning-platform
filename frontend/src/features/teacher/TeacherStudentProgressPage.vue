<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { statsApi } from '../../api'
import type { components } from '../../api/generated/schema'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'
import { formatTime } from '../courses/format'
import { isUuid } from '../assignments/format'
import { targetRoute } from '../notifications/target-route'

type TeacherLearningRecordsDTO = components['schemas']['TeacherLearningRecordsDTO']
type KnowledgeAssessment = components['schemas']['KnowledgeAssessment']

const route = useRoute()
const auth = useAuthStore()
const PAGE_SIZE = 10

const offeringId = computed(() => {
  const value = route.params.offeringId
  return typeof value === 'string' && isUuid(value) ? value : null
})
const studentId = computed(() => {
  const value = route.params.studentId
  return typeof value === 'string' && isUuid(value) ? value : null
})

const page = ref(1)
const query = usePageQuery(async signal => {
  if (offeringId.value === null || studentId.value === null) throw new Error('链接无效，请从班级成员重新进入。')
  return (await statsApi().getStudentLearningRecords(offeringId.value, studentId.value, { page: page.value, pageSize: PAGE_SIZE }, { signal })).data
})
watch(() => auth.identity?.id, () => { page.value = 1; void query.load() })
watch([offeringId, studentId], () => { page.value = 1; void query.load() }, { immediate: true })
watch(page, () => { void query.load() })

const records = computed(() => query.data.value)
const restricted = computed(() => {
  const kind = query.error.value?.kind
  return query.status.value === 'error' && (kind === 'forbidden' || kind === 'not-found')
})

const ASSESSMENT_LABELS: Record<KnowledgeAssessment['assessmentState'], string> = {
  basically_mastered: '基本掌握',
  needs_practice: '需要巩固',
  learning: '正在学习',
  insufficient_evidence: '证据不足',
}
const ASSESSMENT_TONES: Record<KnowledgeAssessment['assessmentState'], string> = {
  basically_mastered: 'tag-on',
  needs_practice: 'tag-warn',
  learning: 'tag-info',
  insufficient_evidence: 'tag-off',
}
const RESULT_LABELS: Record<string, string> = {
  meets_expectation: '符合要求',
  needs_practice: '需要练习',
  insufficient_evidence: '证据不足',
}
const FRESHNESS_LABELS: Record<KnowledgeAssessment['freshness'], string> = {
  fresh: '证据新鲜',
  stale: '证据较旧',
  none: '暂无证据',
}

// 与学生端一致：高亮已展示的最近反馈不再进入历史列表
const pagedItems = computed(() => (records.value?.feedbackPage.items ?? []).filter(item => item.id !== records.value?.recentFeedback?.id))
const totalPages = computed(() => Math.max(1, Math.ceil((records.value?.feedbackPage.total ?? 0) / PAGE_SIZE)))

const recommendationLink = computed(() => {
  const target = records.value?.nextRecommendation?.target ?? null
  if (target === null) return null
  const routeTo = targetRoute(target)
  return typeof routeTo === 'string' || routeTo === null ? null : routeTo
})
</script>

<template>
  <div class="workspace-page teacher-page teacher-student-progress">
    <RouterLink class="teacher-back" :to="{ name: 'teacher-offering', params: { id: offeringId ?? '' } }">返回教学班工作台</RouterLink>
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">{{ records?.student.displayName ?? '学生学习记录' }}</h1>
        <p v-if="records">{{ records.student.username }} · 学习结论由已发布评价与可信证据生成，仅供参考，成绩以教师确认为准。</p>
      </div>
    </header>

    <p v-if="offeringId === null || studentId === null" class="notice notice-warn" role="alert">链接无效，请从教学班工作台的班级成员重新进入。</p>
    <template v-else>
      <p v-if="restricted" class="notice notice-warn" role="alert">无法查看该学生的学习记录：目标不是本班学生或你不是本班授课教师。</p>
      <ApiState v-else :status="query.status.value" :error="query.error.value" @retry="query.load" />

      <template v-if="query.status.value === 'success' && records">
        <section class="surface progress-summary" aria-label="学习概览">
          <dl class="progress-stats">
            <div><dt>已完成实验</dt><dd>{{ records.summary.completedLabCount }}</dd></div>
            <div><dt>已发布评价</dt><dd>{{ records.summary.publishedFeedbackCount }}</dd></div>
            <div v-if="records.summary.needsPracticeCount !== null"><dt>待加强知识点</dt><dd>{{ records.summary.needsPracticeCount }}</dd></div>
          </dl>
          <p class="teacher-muted">阅读与评价计数不直接作为成绩或能力结论。</p>
        </section>

        <section class="surface progress-section" aria-labelledby="progress-knowledge-title">
          <h2 id="progress-knowledge-title">知识点掌握（规则 {{ records.knowledgeEvidence[0]?.ruleVersion ?? 'knowledge-v2' }}）</h2>
          <p v-if="records.knowledgeEvidence.length === 0" class="teacher-muted">暂无知识点结论。发布包含知识点评价的反馈后，这里会给出按证据生成的掌握状态。</p>
          <ul v-else class="progress-knowledge">
            <li v-for="item in records.knowledgeEvidence" :key="item.knowledgePointId">
              <div class="progress-knowledge-head">
                <strong>{{ item.title }}</strong>
                <span class="tag" :class="ASSESSMENT_TONES[item.assessmentState]">{{ ASSESSMENT_LABELS[item.assessmentState] }}</span>
              </div>
              <p class="teacher-muted">{{ FRESHNESS_LABELS[item.freshness] }} · 证据 {{ item.evidenceCount }} 条 · 评估于 {{ formatTime(item.asOf) }}</p>
              <p class="progress-explanation">{{ item.explanation }}</p>
              <details v-if="item.evidence.length > 0" class="progress-evidence">
                <summary>查看证据（{{ item.evidence.length }} 条）</summary>
                <ul>
                  <li v-for="evidence in item.evidence" :key="evidence.id">
                    <p class="progress-evidence-meta">
                      <span>{{ evidence.assignmentTitle }} · {{ RESULT_LABELS[evidence.result] ?? evidence.result }}</span>
                      <time :datetime="evidence.occurredAt">{{ formatTime(evidence.occurredAt) }}</time>
                    </p>
                    <p class="progress-evidence-note">{{ evidence.note }}</p>
                  </li>
                </ul>
              </details>
            </li>
          </ul>
        </section>

        <section v-if="records.nextRecommendation" class="surface progress-section" aria-labelledby="progress-reco-title">
          <h2 id="progress-reco-title">下一步建议</h2>
          <p class="progress-reco-title">{{ records.nextRecommendation.title }}</p>
          <p class="progress-explanation">{{ records.nextRecommendation.reason }}</p>
          <RouterLink v-if="recommendationLink !== null" class="button secondary" :to="recommendationLink">查看关联内容</RouterLink>
        </section>

        <section class="surface progress-section" aria-labelledby="progress-feedback-title">
          <h2 id="progress-feedback-title">教师反馈</h2>
          <template v-if="records.recentFeedback">
            <div class="progress-feedback-highlight">
              <div class="progress-score"><strong>{{ records.recentFeedback.score }}</strong><span>/ {{ records.recentFeedback.maxScore }}</span></div>
              <div class="progress-feedback-main">
                <RouterLink :to="{ name: 'teacher-assignment', params: { id: records.recentFeedback.assignmentId } }">{{ records.recentFeedback.assignmentTitle }}</RouterLink>
                <p class="progress-comment">{{ records.recentFeedback.comment }}</p>
                <time class="teacher-muted" :datetime="records.recentFeedback.publishedAt ?? undefined">{{ records.recentFeedback.publishedAt !== null ? formatTime(records.recentFeedback.publishedAt) : '未发布' }}</time>
              </div>
            </div>
          </template>
          <p v-else class="teacher-muted">尚未向该学生发布过评价。</p>
          <template v-if="pagedItems.length > 0">
            <h3>更多评价历史</h3>
            <ul class="progress-history">
              <li v-for="item in pagedItems" :key="item.id">
                <RouterLink :to="{ name: 'teacher-assignment', params: { id: item.assignmentId } }">{{ item.assignmentTitle }}</RouterLink>
                <span class="progress-score-inline">{{ item.score }}/{{ item.maxScore }}</span>
                <time :datetime="item.publishedAt ?? undefined">{{ item.publishedAt !== null ? formatTime(item.publishedAt) : '—' }}</time>
              </li>
            </ul>
            <nav v-if="totalPages > 1" class="teacher-pagination" aria-label="评价历史分页">
              <span>第 {{ page }} 页 · 共 {{ records.feedbackPage.total }} 条</span>
              <div>
                <button type="button" class="button secondary" :disabled="page <= 1" @click="page -= 1">上一页</button>
                <button type="button" class="button secondary" :disabled="page >= totalPages" @click="page += 1">下一页</button>
              </div>
            </nav>
          </template>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.progress-summary { padding: 18px 26px; margin-bottom: 20px; }
.progress-stats { display: flex; flex-wrap: wrap; gap: 12px 48px; margin: 0 0 8px; }
.progress-stats dt { font-size: 13px; color: var(--muted); }
.progress-stats dd { margin: 2px 0 0; font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
.progress-summary .teacher-muted { margin: 0; font-size: 12px; }
.progress-section { padding: 22px 26px; margin-bottom: 20px; }
.progress-section h2 { font-size: 18px; margin: 0 0 12px; }
.progress-section h3 { font-size: 15px; margin: 18px 0 10px; }
.progress-knowledge { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.progress-knowledge li { border: 1px solid var(--line); border-radius: var(--radius-control); padding: 14px 16px; display: grid; gap: 6px; }
.progress-knowledge-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.progress-knowledge-head strong { font-size: 15px; }
.tag-warn { background: var(--orange-soft); color: var(--orange); }
.tag-info { background: var(--blue-soft); color: var(--blue-text); }
.progress-explanation { margin: 0; font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.progress-evidence summary { min-height: 44px; display: flex; align-items: center; color: var(--blue-text); cursor: pointer; }
.progress-evidence ul { list-style: none; margin: 0; padding: 0 0 6px; display: grid; gap: 10px; }
.progress-evidence li { border-top: 1px solid var(--line); padding-top: 10px; }
.progress-evidence-meta { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.progress-evidence-meta time { font-weight: 400; color: var(--muted); }
.progress-evidence-note { margin: 0; font-size: 13px; line-height: 1.7; color: var(--muted); overflow-wrap: anywhere; }
.progress-reco-title { margin: 0 0 6px; font-weight: 600; }
.progress-section .button { margin-top: 10px; }
.progress-feedback-highlight { display: flex; gap: 18px; align-items: flex-start; }
.progress-score { display: flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; }
.progress-score strong { font-size: 34px; font-weight: 500; font-family: var(--font-serif); }
.progress-score span { font-size: 13px; color: var(--muted); }
.progress-feedback-main { display: grid; gap: 6px; min-width: 0; }
.progress-feedback-main a { color: var(--ink); font-weight: 600; overflow-wrap: anywhere; }
.progress-feedback-main a:hover { color: var(--blue-text); }
.progress-comment { margin: 0; font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.progress-history { list-style: none; margin: 0; padding: 0; }
.progress-history li { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--line); }
.progress-history a { color: var(--ink); overflow-wrap: anywhere; }
.progress-history a:hover { color: var(--blue-text); }
.progress-score-inline { margin-left: auto; font-variant-numeric: tabular-nums; font-size: 13px; }
.progress-history time { font-size: 13px; color: var(--muted); }
</style>
