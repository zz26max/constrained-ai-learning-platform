<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { assignmentsApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { useAssignmentActions } from './use-assignment-actions'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import StudentFeedbackView from './StudentFeedbackView.vue'
import { usePageQuery } from '../courses/use-page-query'
import { assignmentStateLabel, dueText, isUuid } from './format'

const route = useRoute()
const api = assignmentsApi()
const router = useRouter()
const readActions = useAssignmentActions()
const page = ref(1)
const historyQuery = usePageQuery(async signal => (await api.listMySubmissions(assignmentId.value, { page: page.value, pageSize: 10 }, { signal })).data)
watch(page, () => { void historyQuery.load() })

const assignmentId = computed(() => {
  const id = route.params.id
  return isUuid(id) ? id : ''
})

const query = usePageQuery(async signal => {
  const id = assignmentId.value
  if (!id) throw new Error('作业ID无效')
  const result = await api.getAssignment(id, { signal })
  return result.data
})

const feedbackQuery = usePageQuery(async signal => {
  const feedbackId = route.query.feedbackId ?? (route.query.submissionId ? undefined : query.data.value?.publishedFeedbackId ?? undefined)
  const submissionId = route.query.submissionId
  if (feedbackId !== undefined && !isUuid(feedbackId)) throw new Error('评价链接无效')
  if (submissionId !== undefined && !isUuid(submissionId)) throw new Error('提交链接无效')
  const feedback = feedbackId ? (await api.getFeedback(feedbackId, { signal })).data : null
  if (feedback && feedback.assignmentId !== assignmentId.value) throw new Error('评价不属于当前作业')
  const id = feedback?.submissionId ?? submissionId ?? query.data.value?.latestSubmissionId
  if (!id) return null
  const submission = (await api.getSubmission(id, { signal })).data
  if ('student' in submission || submission.assignmentId !== assignmentId.value) throw new Error('提交不属于当前作业')
  return { submission, feedback: feedback ?? submission.publishedFeedback }
})

async function markFeedbackRead(): Promise<void> {
  const feedback = feedbackQuery.data.value?.feedback
  if (!feedback || feedbackQuery.status.value !== 'success') return
  await readActions.run(token => api.readMessage(feedback.messageId, { csrfToken: token }), '相关反馈消息已读')
}
watch(() => feedbackQuery.status.value, async status => {
  if (status === 'success') { await nextTick(); await markFeedbackRead() }
})
function selectSubmission(id: string): void {
  void router.push({ query: { submissionId: id } })
}

watch(() => route.fullPath, async () => {
  await query.load()
  if (query.status.value === 'success') await Promise.all([feedbackQuery.load(), historyQuery.load()])
}, { immediate: true })

// 文案只翻译后端 submissionBlockedReason，不自行推断是否可提交。
const BLOCKED_LABELS: Record<string, string> = {
  OFFERING_ARCHIVED: '教学班已归档',
  ASSIGNMENT_ARCHIVED: '作业已归档',
  RESUBMIT_AFTER_REVIEW: '已评价，不能再次提交',
  RESUBMIT_NOT_ALLOWED: '本作业不允许重新提交',
  ATTEMPT_LIMIT_REACHED: '提交次数已用完',
  SUBMISSION_CLOSED: '提交窗口已关闭',
}

const canStartWork = computed(() => {
  const data = query.data.value
  if (!data) return false
  if (data.offeringStatus !== 'active') return false
  if (data.publicationState === 'archived') return false
  return true
})
</script>

<template>
  <div class="workspace-page reading-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">{{ query.data.value?.title ?? '作业详情' }}</h1>
        <p v-if="query.data.value">
          {{ dueText(query.data.value.dueAt, query.data.value.overdue ?? false) }}
          · {{ assignmentStateLabel(query.data.value.assignmentState ?? 'NOT_STARTED') }}
          <span v-if="query.data.value.overdue" class="tag tag-overdue">已逾期</span>
          <span v-if="query.data.value.publicationState === 'archived'" class="tag">已归档</span>
        </p>
      </div>
      <div class="workspace-heading-actions">
        <RouterLink
          class="button secondary"
          :to="{ name: 'student-tutoring', params: { id: assignmentId } }"
        >
          AI 辅导
        </RouterLink>
        <RouterLink
          v-if="canStartWork"
          class="button"
          :class="{ secondary: query.data.value?.canSubmit !== true }"
          :to="{ name: 'student-workspace', params: { id: assignmentId } }"
        >
          进入工作区
        </RouterLink>
        <RouterLink class="button secondary" to="/student/assignments">← 返回列表</RouterLink>
      </div>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <template v-if="query.status.value === 'success' && query.data.value">
      <p v-if="query.data.value.offeringStatus === 'archived'" class="notice notice-info">
        教学班已归档，作业为只读。
      </p>

      <section class="surface reading-content">
        <header class="section-heading">
          <h2>作业要求</h2>
          <span class="tag">{{ query.data.value.isRequired ? '必修' : '选修' }}</span>
        </header>

        <SafeMarkdown :content="query.data.value.description" />

        <section class="reading-section">
          <h3>具体要求</h3>
          <ul>
            <li v-for="(req, index) in query.data.value.requirements" :key="index">
              <SafeMarkdown :content="req" />
            </li>
          </ul>
        </section>

        <section v-if="query.data.value.rubric.length > 0" class="reading-section">
          <h3>评分标准</h3>
          <p class="muted">满分：{{ query.data.value.maxScore }} 分</p>
          <ul>
            <li v-for="criterion in query.data.value.rubric" :key="criterion.criterionId">
              <strong>{{ criterion.title }}</strong>
              （{{ criterion.maxScore }} 分）
              <p class="muted">{{ criterion.description }}</p>
            </li>
          </ul>
        </section>

        <section class="reading-section">
          <h3>开始作业</h3>
          <p v-if="!canStartWork" class="muted">
            {{ query.data.value.publicationState === 'archived' ? '作业已归档' : '教学班已归档' }}，无法编辑工作区。
          </p>
          <p v-else-if="query.data.value.canSubmit !== true" class="muted">
            暂不能提交：{{ BLOCKED_LABELS[query.data.value.submissionBlockedReason ?? ''] ?? '当前不可提交' }}。仍可在工作区保存练习内容。
          </p>
          <p v-else class="muted">提交时会先保存最新编辑，教师收到的是本次确认的版本。</p>
        </section>
      </section>

      <section class="surface" aria-label="我的提交记录">
        <h2>我的提交记录</h2>
        <ApiState :status="historyQuery.status.value" :error="historyQuery.error.value" @retry="historyQuery.load" />
        <template v-if="historyQuery.status.value === 'success' && historyQuery.data.value">
          <p v-if="!historyQuery.data.value.items.length">尚未提交作品。</p>
          <ul><li v-for="item in historyQuery.data.value.items" :key="item.id"><button type="button" class="button secondary" @click="selectSubmission(item.id)">查看第 {{ item.attemptNumber }} 次提交 · 版本 {{ item.workspaceRevision }}</button><span v-if="item.superseded">已被新提交替代</span></li></ul>
          <nav v-if="historyQuery.data.value.total > 10" aria-label="提交记录分页"><button :disabled="page <= 1" @click="page--">上一页</button><span>第 {{ page }} 页</span><button :disabled="page * 10 >= historyQuery.data.value.total" @click="page++">下一页</button></nav>
        </template>
      </section>
      <div>
        <ApiState :status="feedbackQuery.status.value" :error="feedbackQuery.error.value" @retry="feedbackQuery.load" />
        <section v-if="feedbackQuery.status.value === 'success' && feedbackQuery.data.value" class="surface" aria-label="提交作品快照">
          <h2>第 {{ feedbackQuery.data.value.submission.attemptNumber }} 次提交 · 版本 {{ feedbackQuery.data.value.submission.workspaceRevision }}</h2>
          <p>这是提交时的不可变作品，工作区后续练习不会改变它。</p>
          <div v-for="file in feedbackQuery.data.value.submission.files" :key="file.path"><h3>{{ file.path }}</h3><pre>{{ file.content }}</pre></div>
          <h3>完成反思</h3><SafeMarkdown :content="feedbackQuery.data.value.submission.reflection" />
        </section>
        <StudentFeedbackView
          v-if="feedbackQuery.status.value === 'success' && feedbackQuery.data.value?.feedback"
          :feedback="feedbackQuery.data.value.feedback"
          :rubric="feedbackQuery.data.value.submission.assignmentSnapshot.rubric"
        />
        <ActionNotice :error="readActions.error.value" :message="readActions.message.value" />
        <button v-if="readActions.error.value" type="button" class="button secondary" :disabled="readActions.pending.value" @click="markFeedbackRead">重试标记已读</button>
      </div>
    </template>
  </div>
</template>
