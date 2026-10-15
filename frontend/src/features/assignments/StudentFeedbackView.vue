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
  margin-top: 1.5rem;
}

.feedback-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--surface-secondary, #f5f5f5);
  border-radius: 0.5rem;
}

.score-display {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.score-display .label {
  font-size: 0.875rem;
  color: var(--text-muted, #666);
}

.score-display .score {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--primary, #0066cc);
}

.overall-comment {
  margin-bottom: 1.5rem;
}

.rubric-scores {
  margin-top: 1.5rem;
}

.rubric-item {
  margin-bottom: 1rem;
  padding: 1rem;
  background: var(--surface-secondary, #f5f5f5);
  border-radius: 0.5rem;
}

.rubric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.rubric-header .score {
  font-weight: bold;
  color: var(--primary, #0066cc);
}

.rubric-comment {
  margin-top: 0.5rem;
  color: var(--text-secondary, #333);
}
</style>
