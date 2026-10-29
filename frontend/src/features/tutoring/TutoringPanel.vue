<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
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
  concept: '概念解释',
  debug_hint: '排错提示',
  guided_question: '引导提问',
  fallback: '安全模板',
}
const ACTION_LABELS = { ask: '继续追问', concept: '解释概念', next_hint: '下一层提示' } as const

/** 已到达的提示层级：安全模板不计层，与契约的 fallback 语义一致。 */
const hintLevel = computed(() => Math.max(0, ...messages.value
  .filter(message => message.role === 'assistant' && message.mode !== 'fallback')
  .map(message => message.hintLevel ?? 0)))
const clock = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
</script>

<template>
  <div class="tutoring-panel">
    <ApiState :status="policyQuery.status.value" :error="policyQuery.error.value" @retry="policyQuery.load" />

    <template v-if="policyQuery.status.value === 'success' && policy">
      <div v-if="!policy.enabled" class="chat-empty">
        <p>这项作业没有开启 AI 辅导。</p>
        <p class="meta">遇到问题可以直接问老师。</p>
        <RouterLink class="button primary" :to="{ name: 'student-help-new', params: { id: assignmentId } }">问老师</RouterLink>
      </div>

      <div v-else class="tutor-grid">
        <div class="chat-col">
          <div class="sessions">
            <div class="session-btns" role="group" aria-label="辅导会话">
              <button
                v-for="session in sessionsQuery.data.value?.items ?? []"
                :key="session.id"
                type="button"
                class="session-btn"
                :aria-pressed="activeSession?.id === session.id"
                @click="selectSession(session)"
              >
                会话 · {{ new Date(session.createdAt).toLocaleDateString('zh-CN') }}
              </button>
            </div>
            <button type="button" class="quiet-btn" :disabled="creatingSession" @click="startSession">
              {{ creatingSession ? '正在创建…' : '+ 新会话' }}
            </button>
          </div>

          <ApiState v-if="sessionsQuery.status.value === 'error'" :status="sessionsQuery.status.value" :error="sessionsQuery.error.value" @retry="sessionsQuery.load" />

          <section v-if="activeSession !== null" class="chat" aria-label="辅导对话">
            <ol v-if="messages.length > 0" class="thread">
              <li v-for="message in messages" :key="message.id" :class="['msg', message.role]">
                <span class="lv">
                  {{ message.role === 'student' ? '我' : 'AI 助教' }}<template v-if="message.role === 'assistant' && message.mode !== null"> · {{ MODE_LABELS[message.mode] ?? message.mode }}<template v-if="message.hintLevel !== null"> · 第 {{ message.hintLevel }} 级</template></template>
                </span>
                <p v-if="message.content !== null" class="msg-text">{{ message.content }}</p>
                <p v-else class="msg-text meta">内容已过保留期限，不可查看。</p>
                <span v-if="message.role === 'student'" class="meta msg-time">{{ clock(message.createdAt) }}</span>
              </li>
              <li v-if="poll.state.value === 'polling'" class="msg assistant pending" aria-live="polite">
                <span class="lv">AI 助教 · {{ pendingRequest?.status === 'running' ? '生成中' : '排队中' }}</span>
                <p class="msg-text meta" role="status">回复经过审核后才会显示。</p>
              </li>
            </ol>
            <p v-else-if="poll.state.value !== 'polling'" class="chat-empty-text">
              还没有提问。描述你遇到的问题，或请 AI 解释一个概念。
            </p>
          </section>

          <form v-if="activeSession !== null" class="composer" @submit.prevent="send">
            <fieldset :disabled="sending || poll.state.value === 'polling'" class="composer-fields" aria-label="向 AI 助教提问">
              <div class="seg" role="radiogroup" aria-label="提问方式">
                <label v-for="(label, key) in ACTION_LABELS" :key="key" class="seg-option" :aria-pressed="action === key">
                  <input v-model="action" type="radio" :value="key" name="tutoring-action" />
                  <span>{{ label }}</span>
                </label>
              </div>
              <label class="field col">
                <span>你的问题</span>
                <textarea v-model="content" rows="2" maxlength="4000" :disabled="poll.state.value === 'polling'" required placeholder="描述现象与具体疑问" />
              </label>
              <label class="field col">
                <span>实际尝试（第 {{ policy.requireAttemptFromLevel }} 级起必填）</span>
                <textarea v-model="attempt" rows="2" maxlength="8000" :disabled="poll.state.value === 'polling'" placeholder="已经做过什么、结果如何" />
              </label>
              <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
              <div class="composer-foot">
                <span class="meta">提示最多 {{ policy.maxHintLevel }} 级</span>
                <button type="submit" class="button primary" :disabled="sending || poll.state.value === 'polling'">
                  {{ poll.state.value === 'polling' ? '等待回复…' : sending ? '正在发送…' : '发送' }}
                </button>
              </div>
            </fieldset>
          </form>
        </div>

        <aside class="col side">
          <section class="sec">
            <h2>本作业的辅导规则</h2>
            <p class="lead-sm">{{ policy.boundaryText }}</p>
            <dl class="facts">
              <div><dt>当前层级</dt><dd><span class="levels"><i v-for="level in policy.maxHintLevel" :key="level" :class="{ on: level <= hintLevel }" /></span>第 {{ hintLevel }}/{{ policy.maxHintLevel }} 级</dd></div>
              <div><dt>完整答案</dt><dd>{{ policy.restrictCompleteSolution ? '不提供' : '可提供' }}</dd></div>
              <div><dt>代码块</dt><dd>{{ policy.allowCodeBlocks ? '允许' : '不生成' }}</dd></div>
              <div><dt>需附尝试</dt><dd>第 {{ policy.requireAttemptFromLevel }} 级起</dd></div>
              <div><dt>次数上限</dt><dd>每天 {{ policy.dailyAssignmentLimit }} 次 · 每分钟 {{ policy.perMinuteLimit }} 次</dd></div>
            </dl>
          </section>
          <section class="sec">
            <h2>仍然没解决</h2>
            <p class="meta">问老师时可以附上这里已经给出的提示。</p>
            <RouterLink class="quiet-link" :to="{ name: 'student-help-new', params: { id: assignmentId } }">问老师</RouterLink>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
