<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { tutoringApi } from '../../api'
import type { TutoringMessageDTO, TutoringSessionDTO } from '../../api/tutoring'
import { ApiError } from '../../api/client'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'
import { useTutoringPoll } from './use-tutoring-poll'

const props = defineProps<{ assignmentId: string }>()
const auth = useAuthStore()

const policyQuery = usePageQuery(async signal => (await tutoringApi().getAiPolicy(props.assignmentId, { signal })).data)
const sessionsQuery = usePageQuery(async signal => (await tutoringApi().listTutoringSessions(props.assignmentId, { pageSize: 20 }, { signal })).data)
const policy = computed(() => policyQuery.data.value)

const activeSession = shallowRef<TutoringSessionDTO | null>(null)
const messagesQuery = usePageQuery(async signal => {
  if (activeSession.value === null) throw new Error('尚未选择辅导会话')
  return (await tutoringApi().listTutoringMessages(activeSession.value.id, { pageSize: 50 }, { signal })).data
})
const messages = computed(() => messagesQuery.data.value?.items ?? [])

const poll = useTutoringPoll()
const pendingRequest = poll.request

const action = ref<'ask' | 'concept' | 'next_hint'>('ask')
const content = ref('')
const attempt = ref('')
const sending = ref(false)
const actionError = ref('')
const creatingSession = ref(false)
let generation = 0

watch(() => props.assignmentId, () => {
  generation += 1
  activeSession.value = null
  actionError.value = ''
  void policyQuery.load()
  void sessionsQuery.load()
}, { immediate: true })

watch(() => auth.identity?.id, (next, previous) => {
  if (next !== previous) {
    activeSession.value = null
    poll.stop()
    void sessionsQuery.load()
  }
})

/** 会话列表加载后默认进入最近一个会话；存在遗留 pendingRequestId 时恢复轮询（FRONTEND §6）。 */
watch(sessionsQuery.data, sessions => {
  if (sessions === null || activeSession.value !== null) return
  if (sessions.items.length > 0) selectSession(sessions.items[0]!)
})

function selectSession(session: TutoringSessionDTO): void {
  if (activeSession.value?.id === session.id) return
  activeSession.value = session
  poll.stop()
  void messagesQuery.load().then(() => {
    const pending = activeSession.value?.pendingRequestId
    if (pending !== null && pending !== undefined) poll.poll(pending)
  })
}

async function startSession(): Promise<void> {
  if (creatingSession.value || sending.value) return
  const current = ++generation, userId = auth.identity?.id
  creatingSession.value = true
  actionError.value = ''
  try {
    const token = await auth.ensureCsrfToken()
    const result = await tutoringApi().createTutoringSession({ assignmentId: props.assignmentId }, { csrfToken: token })
    if (current !== generation || auth.identity?.id !== userId) return
    auth.markActionSucceeded()
    await sessionsQuery.load()
    const created = sessionsQuery.data.value?.items.find(item => item.id === result.data.id)
    if (created !== undefined) selectSession(created)
  } catch (cause) {
    if (current !== generation || auth.identity?.id !== userId) return
    actionError.value = cause instanceof ApiError ? cause.message : '创建会话失败，请重试。'
  } finally {
    if (current === generation) creatingSession.value = false
  }
}

async function send(): Promise<void> {
  if (activeSession.value === null || sending.value || poll.state.value === 'polling') return
  if (content.value.trim() === '') {
    actionError.value = '请先写下你的问题。'
    return
  }
  const current = ++generation, userId = auth.identity?.id
  sending.value = true
  actionError.value = ''
  try {
    const token = await auth.ensureCsrfToken()
    const result = await tutoringApi().sendTutoringMessage(activeSession.value.id, {
      action: action.value,
      content: content.value,
      studentAttempt: attempt.value.trim() === '' ? null : attempt.value.trim(),
    }, { csrfToken: token })
    if (current !== generation || auth.identity?.id !== userId) return
    auth.markActionSucceeded()
    content.value = ''
    attempt.value = ''
    await messagesQuery.load()
    poll.poll(result.data.tutoringRequestId)
  } catch (cause) {
    if (current !== generation || auth.identity?.id !== userId) return
    if (cause instanceof ApiError && cause.code === 'AI_REQUEST_IN_PROGRESS') {
      const pending = readPendingRequestId(cause.errorDetails)
      if (pending !== null) {
        actionError.value = '同一作业已有进行中的 AI 请求，正在改为等待它的结果。'
        poll.poll(pending)
        return
      }
    }
    actionError.value = cause instanceof ApiError ? cause.message : '发送失败，请重试。'
  } finally {
    if (current === generation) sending.value = false
  }
}

function readPendingRequestId(details: unknown): string | null {
  if (details !== null && typeof details === 'object' && 'pendingRequestId' in details) {
    const value = (details as { pendingRequestId?: unknown }).pendingRequestId
    if (typeof value === 'string') return value
  }
  return null
}

/** 终态落定后刷新消息与列表（pendingRequestId 清空、助手消息可见）。 */
watch(() => poll.state.value, state => {
  if (state === 'done') {
    void messagesQuery.load()
    void sessionsQuery.load()
  }
})
watch(pendingRequest, request => {
  if (request !== null && request.status === 'failed') {
    actionError.value = request.error !== null ? `请求失败（${request.error.code}）：${request.error.message}` : '请求失败，请稍后重试。'
  }
})

onScopeDispose(() => { generation += 1 })

const MODE_LABELS: Record<string, string> = {
  concept: '概念',
  debug_hint: '排错提示',
  guided_question: '引导提问',
  fallback: '政策回退',
}
const ACTION_HINTS: Record<'ask' | 'concept' | 'next_hint', string> = {
  ask: '围绕当前问题继续追问，不提升提示层次',
  concept: '解释涉及的基础概念',
  next_hint: '获取下一层提示；从第 2 层起需先描述实际尝试',
}
</script>

<template>
  <div class="tutoring-panel">
    <ApiState :status="policyQuery.status.value" :error="policyQuery.error.value" @retry="policyQuery.load" />

    <template v-if="policyQuery.status.value === 'success' && policy">
      <p v-if="!policy.enabled" class="notice notice-info" role="note">
        该作业未启用 AI 辅导。有疑问时请在作业详情发起教师求助。
      </p>

      <template v-else>
        <p class="notice notice-info tutoring-boundary" role="note">{{ policy.boundaryText }}</p>

        <ApiState v-if="sessionsQuery.status.value === 'error'" :status="sessionsQuery.status.value" :error="sessionsQuery.error.value" @retry="sessionsQuery.load" />

        <div v-if="sessionsQuery.status.value === 'success'" class="tutoring-toolbar">
          <div class="tutoring-sessions" role="group" aria-label="辅导会话">
            <button
              v-for="session in sessionsQuery.data.value?.items ?? []"
              :key="session.id"
              type="button"
              class="tutoring-session-chip"
              :aria-pressed="activeSession?.id === session.id"
              @click="selectSession(session)"
            >
              会话 · {{ new Date(session.createdAt).toLocaleDateString('zh-CN') }}
            </button>
          </div>
          <button type="button" class="button secondary" :disabled="creatingSession" @click="startSession">
            {{ creatingSession ? '正在创建…' : '新会话' }}
          </button>
        </div>

        <section v-if="activeSession !== null" class="surface tutoring-messages" aria-label="辅导对话">
          <ol v-if="messages.length > 0" class="tutoring-thread">
            <li v-for="message in messages" :key="message.id" :class="['tutoring-bubble', message.role]">
              <span class="tutoring-role">{{ message.role === 'student' ? '我' : 'AI 助教' }}</span>
              <p v-if="message.content !== null" class="tutoring-content">{{ message.content }}</p>
              <p v-else class="tutoring-content muted">内容已过保留期限，不可查看。</p>
              <span v-if="message.role === 'assistant' && message.mode !== null" class="tag">
                {{ MODE_LABELS[message.mode] ?? message.mode }}<template v-if="message.hintLevel !== null"> · 第 {{ message.hintLevel }} 层</template>
              </span>
            </li>
            <li v-if="poll.state.value === 'polling'" class="tutoring-bubble assistant" aria-live="polite">
              <span class="tutoring-role">AI 助教</span>
              <p class="tutoring-content muted" role="status">AI 正在按引导模式生成回复…（{{ pendingRequest?.status === 'running' ? '生成中' : '排队中' }}）</p>
            </li>
          </ol>
          <p v-else-if="poll.state.value !== 'polling'" class="muted tutoring-empty">
            提问从观察开始：描述你看到的现象与已做的尝试，AI 会以引导问题回应。
          </p>
        </section>

        <form v-if="activeSession !== null" class="tutoring-composer" @submit.prevent="send">
          <fieldset :disabled="sending || poll.state.value === 'polling'" class="tutoring-composer-fields">
            <legend class="sr-only">向 AI 助教提问</legend>
            <div class="tutoring-actions" role="radiogroup" aria-label="提问方式">
              <label v-for="(hint, key) in ACTION_HINTS" :key="key" class="tutoring-action" :aria-pressed="action === key">
                <input v-model="action" type="radio" :value="key" name="tutoring-action" />
                <span>{{ { ask: '继续追问', concept: '解释概念', next_hint: '下一层提示' }[key] }}</span>
              </label>
            </div>
            <p class="muted tutoring-action-hint">{{ ACTION_HINTS[action] }}</p>
            <label class="tutoring-field">
              <span>你的问题</span>
              <textarea v-model="content" rows="3" maxlength="4000" :disabled="poll.state.value === 'polling'" required placeholder="描述现象与具体疑问" />
            </label>
            <label class="tutoring-field">
              <span>实际尝试（第 2 层提示起必填）</span>
              <textarea v-model="attempt" rows="2" maxlength="8000" :disabled="poll.state.value === 'polling'" placeholder="已经做过什么、结果如何" />
            </label>
            <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
            <button type="submit" class="button primary" :disabled="sending || poll.state.value === 'polling'">
              {{ poll.state.value === 'polling' ? '等待 AI 回复…' : sending ? '正在发送…' : '发送' }}
            </button>
          </fieldset>
        </form>
      </template>
    </template>
  </div>
</template>

<style scoped>
.tutoring-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0 0 16px; }
.tutoring-sessions { display: flex; flex-wrap: wrap; gap: 8px; }
.tutoring-session-chip { min-height: 36px; padding: 4px 14px; border: 1px solid var(--line-strong); border-radius: var(--radius-panel); background: var(--surface); color: var(--muted); font-size: 13px; cursor: pointer; }
.tutoring-session-chip[aria-pressed='true'] { border-color: var(--blue); color: var(--blue-text); background: var(--blue-soft); font-weight: 600; }
.tutoring-messages { padding: 20px 22px; }
.tutoring-thread { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.tutoring-bubble { max-width: min(72ch, 92%); display: grid; gap: 6px; }
.tutoring-bubble.student { justify-self: end; background: var(--blue-soft); border-radius: var(--radius-panel); padding: 10px 14px; }
.tutoring-bubble.assistant { justify-self: start; }
.tutoring-role { font-size: 12px; color: var(--muted); }
.tutoring-content { margin: 0; font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.tutoring-empty { margin: 0; }
.tutoring-composer { margin-top: 16px; }
.tutoring-composer-fields { display: grid; gap: 12px; border: 0; padding: 0; margin: 0; min-width: 0; }
.tutoring-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tutoring-action { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-control); font-size: 13px; cursor: pointer; }
.tutoring-action:has(input:checked) { border-color: var(--blue); color: var(--blue-text); background: var(--blue-soft); font-weight: 600; }
.tutoring-action input { margin: 0; accent-color: var(--blue); }
.tutoring-action-hint { margin: 0; font-size: 13px; }
.tutoring-field { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
.tutoring-field textarea { border: 1px solid var(--line-control); border-radius: var(--radius-control); padding: 8px 12px; font: inherit; font-size: 14px; color: var(--ink); background: var(--surface); resize: vertical; }
.tutoring-field textarea:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
.tutoring-composer .button { justify-self: start; }
</style>
