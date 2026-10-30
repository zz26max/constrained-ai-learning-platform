<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { assignmentsApi, tutoringApi } from '../../api'
import { ApiError } from '../../api/client'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { runBounded } from '../courses/worker-pool'
import { useAuthStore } from '../../stores/auth'
import { isUuid } from '../assignments/format'

const SHARE_SESSION_PAGE_SIZE = 20
const SHARE_MESSAGE_PAGE_SIZE = 50
/** 会话消息汇总的并发上限：避免进入页面即串行发出 1+N 个请求。 */
const SHARE_CONCURRENCY = 4

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const assignmentId = computed(() => {
  const value = route.params.id
  return typeof value === 'string' && isUuid(value) ? value : null
})

const assignments = assignmentsApi()
const assignmentQuery = usePageQuery(async signal => {
  if (assignmentId.value === null) throw new Error('作业地址不正确')
  return (await assignments.getAssignment(assignmentId.value, { signal })).data
})
const assignment = computed(() => assignmentQuery.data.value)
const offeringId = computed(() => assignment.value?.offeringId ?? null)

const tagsQuery = usePageQuery(async signal => {
  if (offeringId.value === null) throw new Error('尚未读取到课程')
  return (await tutoringApi().getIssueTags(offeringId.value, { signal })).data
})

/** 可共享的 AI 片段：本人本作业各会话中已交付的助手回复。
    会话按 20 条/页加载并提供"加载更多"；消息以 4 并发有界拉取。
    会话与消息都可能被分页截断：结果携带 loadedSessions/sessionsTotal/truncatedSessions，
    页面如实标注"已显示范围"，不把部分历史当完整历史。 */
interface ShareOption { requestId: string; preview: string }
interface ShareState {
  options: ShareOption[]
  loadedSessions: number
  sessionsTotal: number
  /** 下一页页码：页可能不满，按游标翻页而不是用条数估算。 */
  nextPage: number
  /** 消息数超过单页上限的会话数：这些会话只取了最近 50 条。 */
  truncatedSessions: number
}
const shareOptions = shallowRef<ShareOption[]>([])

async function collectShareOptions(sessions: ReadonlyArray<{ id: string }>, signal: AbortSignal): Promise<{ options: ShareOption[]; truncatedSessions: number }> {
  const perSession = await runBounded(sessions.map(session => async () => {
    const messages = (await tutoringApi().listTutoringMessages(session.id, { pageSize: SHARE_MESSAGE_PAGE_SIZE }, { signal })).data
    const options = messages.items
      .filter(message => message.role === 'assistant' && message.content !== null)
      .map(message => ({ requestId: message.tutoringRequestId, preview: message.content!.slice(0, 60) }))
    return { options, truncated: messages.total > messages.items.length }
  }), SHARE_CONCURRENCY, signal)
  const options: ShareOption[] = perSession.flatMap(item => item!.options)
  const truncatedSessions = perSession.filter(item => item!.truncated).length
  const seen = new Set<string>()
  return { options: options.filter(option => seen.has(option.requestId) ? false : seen.add(option.requestId)), truncatedSessions }
}

const shareQuery = usePageQuery(async signal => {
  if (assignmentId.value === null) throw new Error('作业地址不正确')
  const sessions = (await tutoringApi().listTutoringSessions(assignmentId.value, { page: 1, pageSize: SHARE_SESSION_PAGE_SIZE }, { signal })).data
  const { options, truncatedSessions } = await collectShareOptions(sessions.items, signal)
  return { options, loadedSessions: sessions.items.length, sessionsTotal: sessions.total, nextPage: 2, truncatedSessions } satisfies ShareState
})
watch(() => shareQuery.data.value, state => { shareOptions.value = state?.options ?? [] })

const loadingMore = ref(false)
const shareMoreError = ref('')
async function loadMoreSessions(): Promise<void> {
  const current = shareQuery.data.value
  if (assignmentId.value === null || current === null || loadingMore.value) return
  loadingMore.value = true
  shareMoreError.value = ''
  try {
    const sessions = (await tutoringApi().listTutoringSessions(assignmentId.value, { page: current.nextPage, pageSize: SHARE_SESSION_PAGE_SIZE })).data
    const { options, truncatedSessions } = await collectShareOptions(sessions.items, new AbortController().signal)
    const known = new Set(current.options.map(option => option.requestId))
    const merged: ShareState = {
      options: [...current.options, ...options.filter(option => !known.has(option.requestId))],
      loadedSessions: current.loadedSessions + sessions.items.length,
      sessionsTotal: sessions.total,
      nextPage: current.nextPage + 1,
      truncatedSessions: current.truncatedSessions + truncatedSessions,
    }
    // 追加页不整页重跑首屏查询：就地合并进同一份共享状态。
    shareQuery.data.value = merged
    shareOptions.value = merged.options
  } catch (cause) {
    shareMoreError.value = cause instanceof ApiError ? cause.message : '加载更多会话失败，请稍后重试。'
  } finally {
    loadingMore.value = false
  }
}

const workspaceQuery = usePageQuery(async signal => {
  if (assignmentId.value === null) throw new Error('作业地址不正确')
  return (await assignments.getWorkspace(assignmentId.value, { signal })).data
})

const title = ref('')
const content = ref('')
const attempt = ref('')
const selectedTags = ref<string[]>([])
const sharedRequests = ref<string[]>([])
const shareWorkspace = ref(false)
const submitting = ref(false)
const formError = ref('')

watch(assignmentId, () => {
  if (assignmentId.value !== null) {
    void assignmentQuery.load()
    void shareQuery.load()
    void workspaceQuery.load()
  }
}, { immediate: true })
watch(offeringId, () => { if (offeringId.value !== null) void tagsQuery.load() })

function toggle(list: string[], value: string): void {
  const index = list.indexOf(value)
  if (index >= 0) list.splice(index, 1)
  else list.push(value)
}

async function submit(): Promise<void> {
  if (assignmentId.value === null || submitting.value) return
  if (title.value.trim() === '' || content.value.trim() === '' || attempt.value.trim() === '') {
    formError.value = '标题、问题描述与实际尝试都是必填项。'
    return
  }
  submitting.value = true
  formError.value = ''
  const userId = auth.identity?.id
  try {
    const token = await auth.ensureCsrfToken()
    const result = await tutoringApi().createHelpRequest({
      assignmentId: assignmentId.value,
      title: title.value.trim(),
      content: content.value.trim(),
      studentAttempt: attempt.value.trim(),
      workspaceRevision: shareWorkspace.value && workspaceQuery.data.value !== null ? workspaceQuery.data.value.revision : null,
      sharedTutoringRequestIds: [...sharedRequests.value],
      issueTags: [...selectedTags.value],
    }, { csrfToken: token })
    if (auth.identity?.id !== userId) return
    auth.markActionSucceeded()
    await router.push({ name: 'student-help-request', params: { id: result.data.id } })
  } catch (cause) {
    formError.value = cause instanceof ApiError ? cause.message : '提交失败，请重试。'
  } finally {
    if (auth.identity?.id === userId) submitting.value = false
  }
}
</script>

<template>
  <div class="workspace-page sr-help-create">
    <header class="page-head">
      <div>
        <p class="page-eyebrow"><RouterLink :to="assignmentId !== null ? { name: 'student-assignment', params: { id: assignmentId } } : { name: 'student-assignments' }">← 返回作业</RouterLink></p>
        <h1 class="page-title" tabindex="-1">问老师</h1>
        <p class="page-summary">{{ assignment?.title ?? '正在读取作业…' }}</p>
      </div>
    </header>

    <p v-if="assignmentId === null" class="notice notice-warn" role="alert">作业地址不正确，请从作业列表重新进入。</p>
    <template v-else>
      <ApiState :status="assignmentQuery.status.value" :error="assignmentQuery.error.value" @retry="assignmentQuery.load" />

      <form v-if="assignmentQuery.status.value === 'success'" class="help-form" @submit.prevent="submit">
        <label class="field col">
          <span>标题</span>
          <input v-model="title" maxlength="200" required placeholder="一句话说清问题" />
        </label>
        <label class="field col">
          <span>问题描述</span>
          <textarea v-model="content" rows="4" maxlength="8000" required placeholder="现象是什么，你期望的结果是什么" />
        </label>
        <label class="field col">
          <span>实际尝试</span>
          <textarea v-model="attempt" rows="3" maxlength="8000" required placeholder="已经试过哪些办法，结果如何" />
        </label>

        <fieldset v-if="tagsQuery.status.value === 'success' && tagsQuery.data.value" class="tags">
          <legend>问题标签</legend>
          <div class="tag-options">
            <label v-for="tag in tagsQuery.data.value.items" :key="tag.tag" class="tag-option" :aria-pressed="selectedTags.includes(tag.tag)">
              <input type="checkbox" :value="tag.tag" :checked="selectedTags.includes(tag.tag)" @change="toggle(selectedTags, tag.tag)" />
              <span :title="tag.description">{{ tag.title }}</span>
            </label>
          </div>
        </fieldset>

        <fieldset class="share">
          <legend>共享材料</legend>
          <p class="field-note">教师只能看到勾选的内容。</p>
          <label class="check">
            <input
              v-model="shareWorkspace"
              type="checkbox"
              :disabled="(workspaceQuery.data.value?.revision ?? 0) < 1"
            />
            <span>当前工作区代码（版本 {{ workspaceQuery.data.value?.revision ?? '—' }}{{ (workspaceQuery.data.value?.revision ?? 0) < 1 ? '；尚未保存过，无可共享版本' : '' }}）</span>
          </label>
          <p v-if="shareQuery.status.value === 'error'" class="field-error" role="alert">AI 对话片段加载失败：{{ shareQuery.error.value?.message }}<button type="button" class="button secondary" @click="shareQuery.load">重试</button></p>
          <p v-else-if="shareQuery.status.value === 'loading'" class="field-note" role="status">正在读取可共享的 AI 回复…</p>
          <template v-else>
            <div v-if="shareOptions.length > 0" class="tag-options help-shares">
              <label v-for="option in shareOptions" :key="option.requestId" class="check help-check">
                <input type="checkbox" :value="option.requestId" :checked="sharedRequests.includes(option.requestId)" @change="toggle(sharedRequests, option.requestId)" />
                <span>AI 对话片段：{{ option.preview }}…</span>
              </label>
            </div>
            <p v-else class="field-note">本作业还没有可共享的 AI 回复。</p>
            <p v-if="shareQuery.data.value !== null && (shareQuery.data.value.sessionsTotal > shareQuery.data.value.loadedSessions || shareQuery.data.value.truncatedSessions > 0)" class="field-note">
              仅显示最近 {{ shareQuery.data.value.loadedSessions }} / 共 {{ shareQuery.data.value.sessionsTotal }} 个会话{{ shareQuery.data.value.truncatedSessions > 0 ? `（其中 ${shareQuery.data.value.truncatedSessions} 个会话仅取最近 ${SHARE_MESSAGE_PAGE_SIZE} 条消息）` : '' }}。
            </p>
            <button v-if="shareQuery.data.value !== null && shareQuery.data.value.sessionsTotal > shareQuery.data.value.loadedSessions" type="button" class="button secondary" :disabled="loadingMore" @click="loadMoreSessions">{{ loadingMore ? '正在加载…' : '加载更多会话' }}</button>
            <p v-if="shareMoreError" class="field-error" role="alert">{{ shareMoreError }}</p>
          </template>
        </fieldset>

        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
        <div class="form-foot">
          <RouterLink class="quiet-link" :to="assignmentId !== null ? { name: 'student-assignment', params: { id: assignmentId } } : { name: 'student-assignments' }">取消</RouterLink>
          <button type="submit" class="button primary" :disabled="submitting">{{ submitting ? '正在提交…' : '提交求助' }}</button>
        </div>
      </form>
    </template>
  </div>
</template>


