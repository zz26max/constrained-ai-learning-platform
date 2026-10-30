<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import { assignmentsApi, tutoringApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiNotice from '../../components/ui/UiNotice.vue'
import { useAssignmentActions } from './use-assignment-actions'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import StudentFeedbackView from './StudentFeedbackView.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatShortTime } from '../courses/format'
import { assignmentStateLabel, assignmentTypeLabel, dueInfo, isUuid } from './format'
import { deadlineLabel } from './task-presentation'

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

// 反馈里的知识点标题与问题标签标题来自快照与班级词表；词表为可选增强，读取失败时按原始标识展示。
const issueTagsQuery = usePageQuery(async signal => {
  const offeringId = query.data.value?.offeringId
  if (!offeringId) throw new Error('作业尚未加载')
  return (await tutoringApi().getIssueTags(offeringId, { signal })).data
})
watch(() => query.data.value?.offeringId, () => { if (query.data.value?.offeringId) void issueTagsQuery.load() })

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

type DetailTab = 'req' | 'subs' | 'feedback'
const tab = computed<DetailTab>(() => {
  const value = route.query.tab
  if (value === 'req' || value === 'subs' || value === 'feedback') return value
  return feedbackQuery.data.value?.feedback ? 'feedback' : 'req'
})
function selectTab(next: DetailTab): void {
  void router.push({ query: { ...route.query, tab: next } })
}

async function markFeedbackRead(): Promise<void> {
  const feedback = feedbackQuery.data.value?.feedback
  if (!feedback || feedbackQuery.status.value !== 'success') return
  await readActions.run(token => api.readMessage(feedback.messageId, { csrfToken: token }), '相关反馈消息已读')
}
watch(() => feedbackQuery.status.value, async status => {
  if (status === 'success') { await nextTick(); await markFeedbackRead() }
})
function selectSubmission(id: string): void {
  const next: LocationQuery = { ...route.query, submissionId: id, tab: 'subs' }
  delete next.feedbackId
  void router.push({ query: next })
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

const detail = computed(() => query.data.value ?? null)
const requirements = computed(() => detail.value?.requirements ?? [])
const rubric = computed(() => detail.value?.rubric ?? [])
const typeLabel = computed(() => assignmentTypeLabel(detail.value?.type))
const stateLabel = computed(() => assignmentStateLabel(detail.value?.assignmentState ?? 'NOT_STARTED'))
const due = computed(() => dueInfo(detail.value?.dueAt, detail.value?.overdue ?? false))
const archived = computed(() => detail.value?.offeringStatus !== 'active' || detail.value?.publicationState === 'archived')
const snapshot = computed(() => feedbackQuery.data.value)
const feedback = computed(() => feedbackQuery.data.value?.feedback ?? null)
const historyTotal = computed(() => historyQuery.data.value?.total ?? 0)

const canStartWork = computed(() => {
  const data = detail.value
  if (!data) return false
  if (data.offeringStatus !== 'active') return false
  if (data.publicationState === 'archived') return false
  return true
})

const blockedLabel = computed(() => {
  const data = detail.value
  if (!data || data.canSubmit === true) return ''
  return BLOCKED_LABELS[data.submissionBlockedReason ?? ''] ?? '当前不可提交'
})

const workspaceLabel = computed(() => {
  const data = detail.value
  if (!data) return '进入工作区'
  if (data.canSubmit !== true) return '进入工作区'
  return data.assignmentState === 'NOT_STARTED' ? '开始作答' : '继续作答'
})

const lateText = computed(() => detail.value?.lateUntil ? formatShortTime(detail.value.lateUntil) : '不接受补交')
const attemptsText = computed(() => {
  const data = detail.value
  if (typeof data?.attemptsUsed !== 'number' || typeof data?.maxAttempts !== 'number') return ''
  return `${data.attemptsUsed}/${data.maxAttempts}${data.allowResubmit ? ' · 批阅前可重交' : ''}`
})
</script>

<template>
  <div class="workspace-page sr-tasks sr-assignment">
    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <template v-if="query.status.value === 'success' && detail">
      <header class="page-head">
        <div>
          <p class="page-eyebrow"><RouterLink to="/student/assignments">← 我的作业</RouterLink><template v-if="archived"> · 只读</template></p>
          <h1 class="page-title" tabindex="-1">{{ detail.title }}</h1>
          <p class="page-meta">
            <span v-if="typeLabel">{{ typeLabel }}</span>
            <span>{{ detail.isRequired ? '必做' : '选做' }}</span>
            <span v-if="detail.estimatedMinutes">预计 {{ detail.estimatedMinutes }} 分钟</span>
            <span v-if="detail.maxScore">满分 {{ detail.maxScore }}</span>
            <b v-if="detail.unreadFeedback" class="new">新评价</b>
          </p>
        </div>
      </header>

      <UiNotice v-if="archived" tone="info">教学班或作业已归档，作业为只读，工作区不能继续编辑。</UiNotice>
      <ApiState v-if="feedbackQuery.status.value === 'error'" :status="feedbackQuery.status.value" :error="feedbackQuery.error.value" @retry="feedbackQuery.load" />
      <ActionNotice :error="readActions.error.value" :message="readActions.message.value" />
      <UiButton v-if="readActions.error.value" variant="secondary" :disabled="readActions.pending.value" @click="markFeedbackRead">重试标记已读</UiButton>

      <div class="detail-grid">
        <div class="col main">
          <nav class="tabs" role="tablist" aria-label="作业内容">
            <button type="button" role="tab" :aria-selected="tab === 'req'" :class="{ on: tab === 'req' }" @click="selectTab('req')">要求与评分标准</button>
            <button type="button" role="tab" :aria-selected="tab === 'subs'" :class="{ on: tab === 'subs' }" @click="selectTab('subs')">提交记录 <span class="n">{{ historyTotal }}</span></button>
            <button v-if="feedback" type="button" role="tab" :aria-selected="tab === 'feedback'" :class="{ on: tab === 'feedback' }" @click="selectTab('feedback')">教师评价</button>
          </nav>

          <section v-if="tab !== 'req' && snapshot" class="snap" aria-label="提交作品快照">
            <header class="snap-head">
              <h2>第 {{ snapshot.submission.attemptNumber }} 次提交 · 版本 {{ snapshot.submission.workspaceRevision }}</h2>
              <span v-if="snapshot.submission.submittedAt" class="meta">{{ formatShortTime(snapshot.submission.submittedAt) }}</span>
            </header>
            <p class="meta">提交时的作品，工作区后续修改不会改变它。</p>
            <details v-for="file in snapshot.submission.files ?? []" :key="file.path" class="snap-file">
              <summary>{{ file.path }}</summary>
              <pre>{{ file.content }}</pre>
            </details>
            <h3 class="snap-label">完成反思</h3>
            <SafeMarkdown :content="snapshot.submission.reflection ?? ''" />
          </section>

          <section v-if="tab === 'req'" class="tab-pane" aria-label="要求与评分标准">
            <h2 class="section-label">作业要求</h2>
            <SafeMarkdown :content="detail.description ?? ''" />

            <section v-if="requirements.length" class="req-block">
              <h3>要求</h3>
              <ol class="req"><li v-for="(req, index) in requirements" :key="index"><SafeMarkdown :content="req" /></li></ol>
            </section>

            <section v-if="rubric.length" class="rubric-block">
              <h3>评分标准 <span class="meta">满分 {{ detail.maxScore }} 分</span></h3>
              <table class="grid-table">
                <thead><tr><th>评分项</th><th class="r">分值</th></tr></thead>
                <tbody><tr v-for="criterion in rubric" :key="criterion.criterionId"><td>{{ criterion.title }}<span v-if="criterion.description" class="crit-desc">{{ criterion.description }}</span></td><td class="r num">{{ criterion.maxScore }}</td></tr></tbody>
              </table>
            </section>

            <p v-if="!canStartWork" class="meta tab-note">{{ archived ? '教学班或作业已归档' : '当前不可进入工作区' }}，无法编辑工作区。</p>
            <p v-else-if="detail.canSubmit !== true" class="meta tab-note">暂不能提交：{{ blockedLabel }}。仍可在工作区保存练习内容。</p>
            <p v-else class="meta tab-note">提交时会先保存最新编辑，教师收到的是本次确认的版本。</p>
          </section>

          <section v-else-if="tab === 'subs'" class="tab-pane" aria-label="提交记录">
            <ApiState :status="historyQuery.status.value" :error="historyQuery.error.value" @retry="historyQuery.load" />
            <template v-if="historyQuery.status.value === 'success' && historyQuery.data.value">
              <div v-if="!historyQuery.data.value.items.length" class="pane-empty">
                <h2>还没有提交</h2>
                <p>{{ canStartWork ? '在工作区完成作答后提交。' : '这项作业已不能提交。' }}</p>
              </div>
              <ol v-else class="subs">
                <li v-for="item in historyQuery.data.value.items" :key="item.id" class="sub-row">
                  <button type="button" class="sub-open" @click="selectSubmission(item.id)">
                    <b>第 {{ item.attemptNumber }} 次提交</b>
                    <span class="meta">{{ item.submittedAt ? formatShortTime(item.submittedAt) : '提交时间未返回' }} · 工作区 r{{ item.workspaceRevision }}</span>
                  </button>
                  <span class="sub-state">
                    <span v-if="item.superseded" class="tag">已被新提交替代</span>
                    <span v-else-if="item.feedbackStatus === 'published'" class="tag t-done">已批阅</span>
                    <span v-else class="tag">待批阅</span>
                    <span v-if="item.late" class="tag t-late">逾期</span>
                  </span>
                </li>
              </ol>
              <nav v-if="historyTotal > 10" class="pager" aria-label="提交记录分页">
                <button type="button" class="quiet-btn" :disabled="page <= 1" @click="page--">上一页</button>
                <span class="meta">第 {{ page }} 页</span>
                <button type="button" class="quiet-btn" :disabled="page * 10 >= historyTotal" @click="page++">下一页</button>
              </nav>
            </template>
          </section>

          <section v-else class="tab-pane" aria-label="教师评价">
            <ApiState v-if="feedbackQuery.status.value === 'loading'" :status="feedbackQuery.status.value" :error="feedbackQuery.error.value" />
            <StudentFeedbackView
              v-else-if="feedback"
              :feedback="feedback"
              :rubric="snapshot?.submission.assignmentSnapshot.rubric ?? []"
              :knowledge-points="snapshot?.submission.assignmentSnapshot.knowledgePoints ?? []"
              :issue-tags="issueTagsQuery.data.value?.items ?? []"
            />
            <div v-else class="pane-empty">
              <h2>还没有发布的评价</h2>
              <p>教师发布后，这里会显示得分、评语和知识点结论。</p>
            </div>
          </section>
        </div>

        <aside class="col side">
          <section class="status-box" aria-label="作业状态">
            <div class="status-top"><span class="status-chip" :data-state="detail.assignmentState ?? 'NOT_STARTED'">{{ stateLabel }}</span><b v-if="detail.unreadFeedback" class="new">新评价</b></div>
            <dl class="facts">
              <div><dt>截止</dt><dd>{{ due.absolute }}<span v-if="due.hasDue" class="rel" :data-tone="detail.overdue ? 'late' : ''">{{ detail.overdue ? '已逾期' : deadlineLabel(detail.dueAt) }}</span></dd></div>
              <div><dt>补交</dt><dd>{{ lateText }}</dd></div>
              <div v-if="attemptsText"><dt>提交次数</dt><dd>{{ attemptsText }}</dd></div>
            </dl>
            <p v-if="archived" class="meta">归档后不再写入阅读与提交状态。</p>
            <p v-else-if="detail.canSubmit !== true" class="meta">{{ blockedLabel }}。</p>
            <p v-else-if="detail.overdue" class="meta">已逾期，仍可补交。</p>
            <RouterLink v-if="canStartWork" class="button primary status-action" :to="{ name: 'student-workspace', params: { id: assignmentId } }">{{ workspaceLabel }}</RouterLink>
          </section>

          <section class="help-block" aria-labelledby="assignment-help-title">
            <h2 id="assignment-help-title" class="section-label">需要帮助</h2>
            <RouterLink class="opt" :to="{ name: 'student-tutoring', params: { id: assignmentId } }"><b>AI 辅导</b><span class="meta">只给思路和排错提示，不给完整答案。</span></RouterLink>
            <RouterLink class="opt" :to="{ name: 'student-help-new', params: { id: assignmentId } }"><b>问老师</b><span class="meta">附上你的尝试和工作区版本。</span></RouterLink>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
