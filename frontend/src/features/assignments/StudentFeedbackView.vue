<script setup lang="ts">
import { computed } from 'vue'
import type { StudentFeedbackDTO } from '../../api/assignments'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import UiNotice from '../../components/ui/UiNotice.vue'

interface Props {
  feedback: StudentFeedbackDTO | null
  rubric: Array<{ criterionId: string; title: string; description: string; maxScore: number }>
  knowledgePoints?: Array<{ id: string; title: string; description: string }>
  issueTags?: Array<{ tag: string; title: string; description: string }>
}

const props = withDefaults(defineProps<Props>(), { knowledgePoints: () => [], issueTags: () => [] })

const isPublished = computed(() => props.feedback?.status === 'published')

const RESULT_LABELS: Record<string, string> = {
  meets_expectation: '符合要求',
  needs_practice: '需要练习',
  insufficient_evidence: '证据不足',
}

// 知识结论按教师评价展示，标题取自提交快照冻结的知识点定义
const knowledgeRows = computed(() => (props.feedback?.knowledgeEvaluations ?? []).map(evaluation => ({
  ...evaluation,
  title: props.knowledgePoints.find(point => point.id === evaluation.knowledgePointId)?.title ?? '知识点',
})))

const tagTitles = computed(() => (props.feedback?.issueTags ?? []).map(tag => ({
  tag,
  title: props.issueTags.find(item => item.tag === tag)?.title ?? tag,
})))

const getRubricScore = (criterionId: string) => {
  return props.feedback?.rubricResults.find((s: { criterionId: string }) => s.criterionId === criterionId)
}

const formatDate = (date: string | null | undefined) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}
</script>

<template>
  <section v-if="isPublished" class="surface feedback-view">
    <header class="section-heading">
      <h3>教师反馈</h3>
      <span class="tag">已发布</span>
    </header>

    <div class="feedback-summary">
      <div class="score-display">
        <span class="label">总分</span>
        <span class="score">{{ feedback?.score }} 分</span>
      </div>
      <div class="publish-time">
        <span class="muted">发布时间: {{ formatDate(feedback?.publishedAt) }}</span>
      </div>
    </div>

    <div v-if="feedback?.comment" class="overall-comment">
      <h4>总体评论</h4>
      <SafeMarkdown :content="feedback.comment" />
    </div>

    <div v-if="rubric.length > 0" class="rubric-scores">
      <h4>评分明细</h4>
      <div v-for="criterion in rubric" :key="criterion.criterionId" class="rubric-item">
        <div class="rubric-header">
          <strong>{{ criterion.title }}</strong>
          <span class="score">{{ getRubricScore(criterion.criterionId)?.score ?? 0 }} / {{ criterion.maxScore }}</span>
        </div>
        <p v-if="getRubricScore(criterion.criterionId)?.comment" class="rubric-comment">
          {{ getRubricScore(criterion.criterionId)?.comment }}
        </p>
      </div>
    </div>

    <div v-if="knowledgeRows.length > 0" class="knowledge-results">
      <h4>知识点结论</h4>
      <div v-for="row in knowledgeRows" :key="row.knowledgePointId" class="rubric-item">
        <div class="rubric-header">
          <strong>{{ row.title }}</strong>
          <span class="tag">{{ RESULT_LABELS[row.result] ?? row.result }}</span>
        </div>
        <p class="rubric-comment">{{ row.note }}</p>
      </div>
      <p class="muted knowledge-note">结论由教师评价生成，作为知识点掌握的证据之一，不直接等于成绩。</p>
    </div>

    <div v-if="tagTitles.length > 0" class="issue-tags">
      <h4>问题标签</h4>
      <span v-for="item in tagTitles" :key="item.tag" class="tag" :title="props.issueTags.find(i => i.tag === item.tag)?.description">{{ item.title }}</span>
    </div>
  </section>

  <section v-else-if="feedback" class="surface feedback-view">
    <UiNotice tone="info">教师正在批阅中，请等待反馈发布</UiNotice>
  </section>
</template>

<style scoped>
.feedback-view {
  margin-top: var(--space-5);
}

.feedback-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-5);
  padding: var(--space-4);
  background: var(--canvas);
  border-radius: var(--radius-control);
}

.score-display {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.score-display .label {
  font-size: var(--fs-meta);
  color: var(--muted);
}

.score-display .score {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 400;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.overall-comment {
  margin-bottom: var(--space-5);
}

.rubric-scores {
  margin-top: var(--space-5);
}

.rubric-item {
  margin-bottom: var(--space-4);
  padding: var(--space-4);
  background: var(--canvas);
  border-radius: var(--radius-control);
}

.rubric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.rubric-header .score {
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.rubric-comment {
  margin-top: var(--space-2);
  color: var(--muted);
}

.knowledge-results {
  margin-top: var(--space-5);
}

.knowledge-note {
  font-size: var(--fs-meta);
  margin-top: var(--space-2);
}

.issue-tags {
  margin-top: var(--space-5);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.issue-tags h4 {
  width: 100%;
  margin: 0;
}
</style>
