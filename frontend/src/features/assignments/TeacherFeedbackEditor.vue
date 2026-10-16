<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { assignmentsApi } from '../../api'
import type { FeedbackWrite, TeacherFeedbackDTO, TeacherSubmissionDetailDTO } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from './use-assignment-actions'
import { isUuid } from './format'

const route = useRoute()
const api = assignmentsApi()
const actions = useAssignmentActions()

const submissionId = computed(() => {
  const id = route.params.submissionId
  return isUuid(id) ? id : ''
})

const query = usePageQuery(async signal => {
  const id = submissionId.value
  if (!id) throw new Error('提交ID无效')
  const { data } = await api.getSubmission(id, { signal })
  if (!('student' in data)) throw new Error('当前账号不能批阅此提交。')
  return data
})

interface RubricInput { score: number; comment: string }

const comment = ref('')
const score = ref(0)
const rubricInputs = ref<Record<string, RubricInput>>({})
const knowledgeEvaluations = ref<TeacherFeedbackDTO['knowledgeEvaluations']>([])
const baseVersion = ref(0)
const published = ref(false)
const publishDialog = ref<HTMLDialogElement | null>(null)

const rubric = computed(() => query.data.value?.assignmentSnapshot.rubric ?? [])
const maxScore = computed(() => query.data.value?.assignmentSnapshot.maxScore ?? 0)
const readOnly = computed(() => published.value || query.data.value?.superseded === true)

function hydrate(data: TeacherSubmissionDetailDTO): void {
  const feedback = data.draftFeedback ?? data.publishedFeedback
  published.value = data.publishedFeedback !== null
  baseVersion.value = feedback?.version ?? 0
  comment.value = feedback?.comment ?? ''
  score.value = feedback?.score ?? 0
  knowledgeEvaluations.value = feedback?.knowledgeEvaluations ?? []
  const inputs: Record<string, RubricInput> = {}
  for (const criterion of data.assignmentSnapshot.rubric) {
    const existing = feedback?.rubricResults.find(item => item.criterionId === criterion.criterionId)
    inputs[criterion.criterionId] = { score: existing?.score ?? 0, comment: existing?.comment ?? '' }
  }
  rubricInputs.value = inputs
}

async function reload(): Promise<void> {
  actions.clearNotice()
  await query.load()
  if (query.status.value === 'success' && query.data.value) hydrate(query.data.value)
}

watch(submissionId, () => { void reload() }, { immediate: true })

const scoresValid = computed(() => {
  const inRange = (value: number, max: number) => Number.isFinite(value) && value >= 0 && value <= max
  return inRange(score.value, maxScore.value)
    && rubric.value.every(criterion => inRange(rubricInputs.value[criterion.criterionId]?.score ?? 0, criterion.maxScore))
})
const canEdit = computed(() => query.status.value === 'success' && !readOnly.value && !actions.pending.value)
const canSave = computed(() => canEdit.value && scoresValid.value)

function buildWrite(): FeedbackWrite {
  return {
    baseVersion: baseVersion.value,
    score: score.value,
    comment: comment.value,
    rubricResults: rubric.value.map(criterion => ({
      criterionId: criterion.criterionId,
      score: rubricInputs.value[criterion.criterionId]?.score ?? 0,
      comment: rubricInputs.value[criterion.criterionId]?.comment ?? '',
    })),
    knowledgeEvaluations: knowledgeEvaluations.value,
  }
}

async function saveDraft(): Promise<void> {
  if (!canSave.value) return
  const id = submissionId.value
  const saved = await actions.run(token => api.saveFeedback(id, buildWrite(), { csrfToken: token }), '反馈草稿已保存')
  if (saved !== null && submissionId.value === id) baseVersion.value = saved.version
}

function openPublishDialog(): void {
  if (!canSave.value) return
  publishDialog.value?.showModal()
}

function closePublishDialog(): void {
  publishDialog.value?.close()
}

async function confirmPublish(): Promise<void> {
  if (!canSave.value) return
  closePublishDialog()
  const id = submissionId.value
  const saved = await actions.run(token => api.saveFeedback(id, buildWrite(), { csrfToken: token }), '反馈草稿已保存')
  if (saved === null || submissionId.value !== id) return
  baseVersion.value = saved.version
  const result = await actions.run(
    token => api.publishFeedback(id, { baseVersion: saved.version }, { csrfToken: token }),
    '反馈已发布，学生将收到通知',
  )
  if (result === null || submissionId.value !== id) return
  baseVersion.value = result.version
  published.value = true
}

onBeforeUnmount(closePublishDialog)
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">批阅作业</h1>
        <p v-if="query.data.value" class="muted">
          {{ query.data.value.student.displayName }} · 第 {{ query.data.value.attemptNumber }} 次提交
        </p>
      </div>
      <RouterLink
        v-if="query.data.value"
        class="button secondary"
        :to="{ name: 'teacher-assignments', params: { offeringId: query.data.value.offeringId } }"
      >
        返回作业管理
      </RouterLink>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="reload" />
    <ActionNotice :error="actions.error.value" :message="actions.message.value" @clear="actions.clearNotice" />
    <p v-if="actions.error.value && query.status.value === 'success'">
      <button type="button" class="button secondary" @click="reload">重新载入最新版本</button>
    </p>

    <template v-if="query.status.value === 'success' && query.data.value">
      <p v-if="query.data.value.superseded" class="notice notice-warning" role="status">该提交已被新提交替代，不能批阅。</p>
      <p v-else-if="published" class="notice notice-info" role="status">反馈已发布，当前为只读。</p>

      <section class="surface">
        <h2>学生提交</h2>
        <p class="muted">提交时间：{{ new Date(query.data.value.submittedAt).toLocaleString('zh-CN') }}{{ query.data.value.late ? ' · 迟交' : '' }}</p>
        <div v-for="file in query.data.value.files" :key="file.path">
          <h3>{{ file.path }}</h3>
          <pre>{{ file.content }}</pre>
        </div>
        <div v-if="query.data.value.reflection">
          <h3>学生反思</h3>
          <SafeMarkdown :content="query.data.value.reflection" />
        </div>
      </section>

      <form class="surface" @submit.prevent="saveDraft">
        <h2>批阅反馈</h2>

        <div class="form-group">
          <label for="feedback-comment">总体评语</label>
          <textarea id="feedback-comment" v-model="comment" rows="6" maxlength="8000" :disabled="!canEdit" />
        </div>

        <div class="form-group">
          <label for="feedback-score">总分（满分 {{ maxScore }}）</label>
          <input id="feedback-score" v-model.number="score" type="number" min="0" :max="maxScore" step="0.01" :disabled="!canEdit" />
        </div>

        <h3>量表评分</h3>
        <fieldset v-for="criterion in rubric" :key="criterion.criterionId" class="rubric-item">
          <legend>{{ criterion.title }}（{{ criterion.maxScore }} 分）</legend>
          <p class="muted">{{ criterion.description }}</p>
          <div v-if="rubricInputs[criterion.criterionId]" class="form-group">
            <label :for="`rubric-score-${criterion.criterionId}`">得分</label>
            <input
              :id="`rubric-score-${criterion.criterionId}`"
              v-model.number="rubricInputs[criterion.criterionId]!.score"
              type="number" min="0" :max="criterion.maxScore" step="0.01" :disabled="!canEdit"
            />
            <label :for="`rubric-comment-${criterion.criterionId}`">评语</label>
            <textarea
              :id="`rubric-comment-${criterion.criterionId}`"
              v-model="rubricInputs[criterion.criterionId]!.comment"
              rows="3" maxlength="8000" :disabled="!canEdit"
            />
          </div>
        </fieldset>

        <p v-if="!scoresValid && !readOnly" class="notice notice-warning" role="status">分数需在 0 到对应满分之间。</p>

        <div class="button-group">
          <button type="submit" class="button secondary" :disabled="!canSave">保存草稿</button>
          <button type="button" class="button" :disabled="!canSave" @click="openPublishDialog">发布反馈</button>
        </div>
      </form>
    </template>

    <dialog ref="publishDialog" class="teacher-dialog teacher-confirm" aria-labelledby="publish-feedback-title">
      <h2 id="publish-feedback-title">确认发布反馈</h2>
      <p>发布后学生将收到通知，且不能再修改。确定要发布吗？</p>
      <div class="teacher-dialog-actions">
        <button type="button" class="button secondary" @click="closePublishDialog">取消</button>
        <button type="button" class="button" :disabled="actions.pending.value" @click="confirmPublish">确认发布</button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.rubric-item { margin-bottom: 1.5rem; padding: 1rem; background: var(--surface-secondary); border-radius: 0.5rem; }
.button-group { display: flex; gap: 1rem; margin-top: 1.5rem; }
pre { overflow: auto; max-height: 20rem; }
</style>
