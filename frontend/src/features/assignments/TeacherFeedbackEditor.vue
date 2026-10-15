<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { assignmentsApi } from '../../api'
import type { FeedbackWrite, RubricScore } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from './use-assignment-actions'
import { isUuid } from './format'
import { ApiError } from '../../api/client'
import { useAuthStore } from '../../stores/auth'

const route = useRoute()
const router = useRouter()
const api = assignmentsApi()
const actions = useAssignmentActions()
const auth = useAuthStore()

const submissionId = computed(() => {
  const id = route.params.submissionId
  return isUuid(id) ? id : ''
})

const query = usePageQuery(async signal => {
  const id = submissionId.value
  if (!id) throw new Error('提交ID无效')
  const [submissionResult, feedbackResult] = await Promise.all([
    api.listMySubmissions(id, {}, { signal }),
    api.getFeedback(id, { signal }).catch(() => null)
  ])
  return {
    submission: submissionResult.data.items[0] ?? null,
    feedback: feedbackResult?.data ?? null
  }
})

const overallComment = ref('')
const finalScore = ref<number>(0)
const rubricScores = ref<RubricScore[]>([])
const baseVersion = ref(0)
const publishing = ref(false)
const showPublishDialog = ref(false)
const conflictError = ref<string | null>(null)

watch(() => route.fullPath, async () => {
  await query.load()
  if (query.data.value?.feedback) {
    const feedback = query.data.value.feedback
    overallComment.value = feedback.overallComment
    finalScore.value = Number(feedback.finalScore)
    rubricScores.value = feedback.rubricScores.map(s => ({
      criterionId: s.criterionId,
      score: s.score,
      comment: s.comment
    }))
    baseVersion.value = feedback.baseVersion
  }
}, { immediate: true })

const maxScore = computed(() => query.data.value?.submission?.maxScore ?? 100)

const canSave = computed(() => {
  return !actions.pending.value && !publishing.value
})

async function saveDraft() {
  if (!canSave.value) return
  conflictError.value = null

  const feedbackWrite: FeedbackWrite = {
    baseVersion: baseVersion.value,
    overallComment: overallComment.value,
    finalScore: String(finalScore.value),
    rubricScores: rubricScores.value
  }

  try {
    const token = await auth.ensureCsrfToken()
    const result = await api.saveFeedback(submissionId.value, feedbackWrite, { csrfToken: token })
    baseVersion.value = result.data.baseVersion
    actions.message.value = '反馈草稿已保存'
  } catch (error) {
    if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
      conflictError.value = '反馈已被其他教师修改，请刷新页面重新编辑'
    } else {
      throw error
    }
  }
}

async function openPublishDialog() {
  if (!canSave.value) return
  showPublishDialog.value = true
}

async function confirmPublish() {
  if (!canSave.value) return
  publishing.value = true
  showPublishDialog.value = false

  try {
    await saveDraft()
    if (conflictError.value) return

    const feedbackId = query.data.value?.feedback?.id
    if (!feedbackId) {
      actions.error.value = { kind: 'unavailable', message: '无法发布：反馈ID不存在' }
      return
    }

    const token = await auth.ensureCsrfToken()
    await api.publishFeedback(feedbackId, { csrfToken: token })
    actions.message.value = '反馈已发布，学生将收到通知'
    setTimeout(() => router.back(), 2000)
  } finally {
    publishing.value = false
  }
}

function updateRubricScore(criterionId: string, score: number, comment: string) {
  const index = rubricScores.value.findIndex(s => s.criterionId === criterionId)
  if (index >= 0) {
    rubricScores.value[index] = { criterionId, score: String(score), comment }
  } else {
    rubricScores.value.push({ criterionId, score: String(score), comment })
  }
}
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">批阅作业</h1>
      </div>
      <button class="button secondary" @click="router.back">← 返回</button>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <ActionNotice :error="actions.error.value" :message="actions.message.value" @clear="actions.clearNotice" />

    <p v-if="conflictError" class="notice notice-warning">{{ conflictError }}</p>

    <template v-if="query.status.value === 'success' && query.data.value">
      <section class="surface">
        <h2>学生提交</h2>
        <p class="muted">提交时间: {{ query.data.value.submission?.submittedAt }}</p>
        <div v-if="query.data.value.submission?.reflection">
          <h3>学生反思</h3>
          <SafeMarkdown :content="query.data.value.submission.reflection" />
        </div>
      </section>

      <section class="surface">
        <h2>批阅反馈</h2>

        <div class="form-group">
          <label for="overall-comment">总体评论</label>
          <textarea
            id="overall-comment"
            v-model="overallComment"
            rows="6"
            @blur="saveDraft"
          />
        </div>

        <div class="form-group">
          <label for="final-score">总分 (满分 {{ maxScore }})</label>
          <input
            id="final-score"
            v-model.number="finalScore"
            type="number"
            :max="maxScore"
            min="0"
            @blur="saveDraft"
          />
        </div>

        <h3>量表评分</h3>
        <div
          v-for="criterion in query.data.value.submission?.rubric ?? []"
          :key="criterion.criterionId"
          class="rubric-item"
        >
          <h4>{{ criterion.title }} ({{ criterion.maxScore }} 分)</h4>
          <p class="muted">{{ criterion.description }}</p>

          <div class="form-group">
            <label>得分</label>
            <input
              :value="rubricScores.find(s => s.criterionId === criterion.criterionId)?.score ?? 0"
              type="number"
              :max="criterion.maxScore"
              min="0"
              @change="e => updateRubricScore(criterion.criterionId, Number((e.target as HTMLInputElement).value), rubricScores.find(s => s.criterionId === criterion.criterionId)?.comment ?? '')"
              @blur="saveDraft"
            />
          </div>

          <div class="form-group">
            <label>评语</label>
            <textarea
              :value="rubricScores.find(s => s.criterionId === criterion.criterionId)?.comment ?? ''"
              rows="3"
              @input="e => updateRubricScore(criterion.criterionId, Number(rubricScores.find(s => s.criterionId === criterion.criterionId)?.score ?? 0), (e.target as HTMLTextAreaElement).value)"
              @blur="saveDraft"
            />
          </div>
        </div>

        <div class="button-group">
          <button
            class="button secondary"
            :disabled="!canSave"
            @click="saveDraft"
          >
            保存草稿
          </button>
          <button
            class="button"
            :disabled="!canSave"
            @click="openPublishDialog"
          >
            发布反馈
          </button>
        </div>
      </section>
    </template>

    <dialog ref="publishDialog" v-model="showPublishDialog">
      <h2>确认发布反馈</h2>
      <p>发布后学生将收到通知，确定要发布吗？</p>
      <div class="button-group">
        <button class="button secondary" @click="showPublishDialog = false">取消</button>
        <button class="button" @click="confirmPublish">确认发布</button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.rubric-item {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--surface-secondary);
  border-radius: 0.5rem;
}

.button-group {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}
</style>
