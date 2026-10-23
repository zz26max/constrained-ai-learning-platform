<script setup lang="ts">
import { computed } from 'vue'
import type { StudentFeedbackDTO } from '../../api/assignments'
import SafeMarkdown from '../../components/SafeMarkdown.vue'

interface Props {
  feedback: StudentFeedbackDTO | null
  rubric: Array<{ criterionId: string; title: string; description: string; maxScore: number }>
}

const props = defineProps<Props>()

const isPublished = computed(() => props.feedback?.status === 'published')

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
  </section>

  <section v-else-if="feedback" class="surface feedback-view">
    <p class="notice notice-info">教师正在批阅中，请等待反馈发布</p>
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
</style>
