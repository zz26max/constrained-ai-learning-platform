<script setup lang="ts">
import { computed, nextTick, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { assignmentsApi, coursesApi, tutoringApi } from '../../api'
import type { TutoringMessageDTO, TutoringWrite } from '../../api/tutoring'
import { ApiError } from '../../api/client'
import ApiState from '../../components/ApiState.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiField from '../../components/ui/UiField.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'
import { useTutoringPoll } from './use-tutoring-poll'
import { useTutoringThread } from './use-tutoring-thread'
import TutoringResourceDialog from './TutoringResourceDialog.vue'

const props = withDefaults(defineProps<{
  assignmentId: string
  offeringId?: string
  embedded?: boolean
  visible?: boolean
  prepareWorkspace?: () => Promise<number | null>
  selectedCode?: () => string
  resumeEditing?: (() => void) | undefined
}>(), { embedded: false, visible: true, prepareWorkspace: undefined })
const auth = useAuthStore()

const policyQuery = usePageQuery(async signal => (await tutoringApi().getAiPolicy(props.assignmentId, { signal })).data)
const sessionsQuery = usePageQuery(async signal => (await tutoringApi().listTutoringSessions(props.assignmentId, { pageSize: 20 }, { signal })).data)
const policy = computed(() => policyQuery.data.value)
const offeringQuery = usePageQuery(async signal => {
  const id = props.offeringId ?? (await assignmentsApi().getAssignment(props.assignmentId, { signal })).data.offeringId
  return (await coursesApi().getOffering(id, { signal })).data
})
watch(() => [props.assignmentId, props.offeringId, auth.identity?.id], () => {
  if (auth.identity) void offeringQuery.load()
}, { immediate: true })
const offering = computed(() => offeringQuery.status.value === 'success' ? offeringQuery.data.value : null)
const hasTeacher = computed(() => (offering.value?.teachers.length ?? 0) > 0)

const activeSessionId = ref<string | null>(null)
const sessions = computed(() => sessionsQuery.data.value?.items.filter(session => session.assignmentId === props.assignmentId) ?? [])
const thread = useTutoringThread(activeSessionId)
const { messages } = thread
const chat = ref<HTMLElement | null>(null)

const poll = useTutoringPoll()
const followedRequest = shallowRef<{ id: string; sessionId: string | null } | null>(null)
const waitingHere = computed(() => poll.state.value === 'polling' && followedRequest.value?.sessionId === activeSessionId.value)
const sendingSessionId = ref<string | null>(null)
const sendingHere = computed(() => sendingSessionId.value !== null && sendingSessionId.value === activeSessionId.value)
const creatingSession = ref(false)
const sendingBlocked = computed(() => creatingSession.value || sendingSessionId.value !== null || poll.state.value === 'polling')
const otherSessionActivity = computed(() => {
  if (sendingSessionId.value !== null && !sendingHere.value) return '另一会话正在发送问题。'
  if (poll.state.value === 'polling' && !waitingHere.value) return '这项作业还有一条 AI 请求，回复会出现在对应的会话。'
  return ''
})

type Citation = TutoringMessageDTO['citations'][number]
const activeCitation = shallowRef<Citation | null>(null)
let citationTrigger: HTMLElement | null = null

function openCitation(citation: Citation, event: MouseEvent): void {
  citationTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  activeCitation.value = citation
}

function closeCitation(destination: 'tutoring' | 'editor'): void {
  const trigger = citationTrigger
  activeCitation.value = null
  citationTrigger = null
  if (destination === 'editor' && props.resumeEditing) props.resumeEditing()
  else if (trigger?.isConnected) trigger.focus({ preventScroll: true })
}

interface Draft {
  action: TutoringWrite['action']
  content: string
  attempt: string
  includeWorkspace: boolean
  error: string
}

const drafts = reactive(new Map<string, Draft>())
const draft = computed(() => activeSessionId.value === null ? undefined : drafts.get(activeSessionId.value))
const composerInput = ref<HTMLTextAreaElement | null>(null)
const sessionError = ref('')
let generation = 0

function draftFor(sessionId: string): Draft {
  if (!drafts.has(sessionId)) {
    drafts.set(sessionId, { action: 'ask', content: '', attempt: '', includeWorkspace: false, error: '' })
  }
  return drafts.get(sessionId)!
}

watch([() => props.assignmentId, () => auth.identity?.id], () => {
  generation += 1
  activeSessionId.value = null
  activeCitation.value = null
  citationTrigger = null
  drafts.clear()
  sessionError.value = ''
  creatingSession.value = false
  sendingSessionId.value = null
  followedRequest.value = null
  poll.stop()
  if (auth.identity) {
    void policyQuery.load()
    void sessionsQuery.load()
  }
}, { immediate: true, flush: 'sync' })

/** 会话列表加载后默认进入最近一个会话；存在遗留 pendingRequestId 时恢复轮询（FRONTEND §6）。 */
watch(sessions, items => {
  const newest = items[0]
  if (activeSessionId.value === null && newest) selectSession(newest.id)
  if (poll.state.value !== 'idle' && poll.state.value !== 'done') return
  const pending = items.find(item => item.pendingRequestId !== null && item.pendingRequestId !== followedRequest.value?.id)
  if (pending?.pendingRequestId) followRequest(pending.pendingRequestId, pending.id)
})

function selectSession(sessionId: string): void {
  if (activeSessionId.value === sessionId) return
  draftFor(sessionId)
  activeCitation.value = null
  citationTrigger = null
  activeSessionId.value = sessionId
}

function followRequest(id: string, sessionId: string | null): void {
  if (followedRequest.value?.id === id && poll.state.value === 'polling') return
  followedRequest.value = { id, sessionId }
  poll.poll(id)
}

function retryPolling(): void {
  if (followedRequest.value) poll.poll(followedRequest.value.id)
}

async function startSession(): Promise<void> {
  if (creatingSession.value || sendingSessionId.value !== null) return
  const current = generation
  const selectedBefore = activeSessionId.value
  creatingSession.value = true
  sessionError.value = ''
  try {
    const token = await auth.ensureCsrfToken()
    if (current !== generation) return
    const result = await tutoringApi().createTutoringSession({ assignmentId: props.assignmentId }, { csrfToken: token })
    if (current !== generation) return
    auth.markActionSucceeded()
    if (activeSessionId.value === selectedBefore) selectSession(result.data.id)
    void sessionsQuery.load()
  } catch (cause) {
    if (current === generation) sessionError.value = cause instanceof ApiError ? cause.message : '创建会话失败，请重试。'
  } finally {
    if (current === generation) creatingSession.value = false
  }
}

async function send(): Promise<void> {
  const sessionId = activeSessionId.value
  const currentDraft = draft.value
  if (sessionId === null || !currentDraft || sendingBlocked.value) return
  if (currentDraft.content.trim() === '') {
    currentDraft.error = '请先写下你的问题。'
    return
  }
  const current = generation
  const body: TutoringWrite = {
    action: currentDraft.action,
    content: currentDraft.content,
    studentAttempt: currentDraft.attempt.trim() || null,
  }
  sendingSessionId.value = sessionId
  currentDraft.error = ''
  try {
    if (currentDraft.includeWorkspace && props.prepareWorkspace) {
      try {
        const workspaceRevision = await props.prepareWorkspace()
        if (workspaceRevision === null) throw new Error('工作区尚未保存。请先保存，或取消附带工作区。')
        body.workspaceRevision = workspaceRevision
      }
      catch (cause) {
        if (current === generation) currentDraft.error = cause instanceof Error ? cause.message : '最新修改尚未保存，暂不能请求 AI 辅导。'
        return
      }
    }
    if (current !== generation) return
    const token = await auth.ensureCsrfToken()
    if (current !== generation) return
    const result = await tutoringApi().sendTutoringMessage(sessionId, body, { csrfToken: token })
    if (current !== generation) return
    auth.markActionSucceeded()
    currentDraft.content = ''
    currentDraft.attempt = ''
    currentDraft.includeWorkspace = false
    followRequest(result.data.tutoringRequestId, sessionId)
    if (activeSessionId.value === sessionId) void thread.refresh()
  } catch (cause) {
    if (current !== generation) return
    if (cause instanceof ApiError && cause.code === 'AI_REQUEST_IN_PROGRESS') {
      const pending = readPendingRequestId(cause.errorDetails)
      if (pending !== null) {
        const owner = sessions.value.find(item => item.pendingRequestId === pending)
        followRequest(pending, owner?.id ?? null)
        return
      }
    }
    currentDraft.error = cause instanceof ApiError ? cause.message : '发送失败，请重试。'
  } finally {
    if (current === generation) sendingSessionId.value = null
  }
}

function readPendingRequestId(details: unknown): string | null {
  if (details !== null && typeof details === 'object' && 'pendingRequestId' in details) {
    const value = (details as { pendingRequestId?: unknown }).pendingRequestId
    if (typeof value === 'string') return value
  }
  return null
}

watch(poll.request, request => {
  if (!request || request.id !== followedRequest.value?.id) return
  // 409 只返回请求 ID。回复状态的归属以请求详情中的会话为准。
  followedRequest.value = { id: request.id, sessionId: request.sessionId }
  if (request.status === 'failed') {
    draftFor(request.sessionId).error = request.error !== null
      ? `请求失败（${request.error.code}）：${request.error.message}`
      : '请求失败，请稍后重试。'
  }
})
watch(poll.state, state => {
  if (state !== 'done') return
  if (poll.request.value?.sessionId === activeSessionId.value) void thread.refresh()
  void sessionsQuery.load()
})

onScopeDispose(() => { generation += 1 })

watch([messages, chat, () => props.visible, waitingHere], ([current, container, visible], [previous, previousChat, wasVisible]) => {
  if (!visible || !container) return
  const top = container.scrollTop
  const height = container.scrollHeight
  const first = previous[0]
  const prepended = first && current[0]?.id !== first.id && current.some(message => message.id === first.id)
  const anchor = prepended ? container.querySelector('.thread > .msg:not(.pending)') : null
  const anchorTop = anchor?.getBoundingClientRect().top
  const followLatest = !wasVisible || previousChat !== container || previous.length === 0 || height - top - container.clientHeight < 32
  void nextTick(() => {
    if (chat.value !== container || messages.value !== current || !props.visible) return
    if (anchor?.isConnected && anchorTop !== undefined) container.scrollTop += anchor.getBoundingClientRect().top - anchorTop
    else if (followLatest) container.scrollTop = container.scrollHeight
  })
})

const MODE_LABELS: Record<string, string> = {
  concept: '概念解释',
  debug_hint: '排错提示',
  guided_question: '引导提问',
  fallback: '安全模板',
}
const ACTION_LABELS = { ask: '继续追问', concept: '解释概念', next_hint: '下一层提示' } as const

const QUICK_ASKS = [
  { label: '解释题目', action: 'concept', content: '请解释这道题的题意和完成标准。' },
  { label: '给我提示', action: 'next_hint', content: '请提示我下一步该验证什么。' },
  { label: '检查思路', action: 'ask', content: '请检查我的思路，指出遗漏或错误。' },
] as const
function applyQuickAsk(preset: typeof QUICK_ASKS[number]): void {
  if (!draft.value) return
  draft.value.action = preset.action
  draft.value.content = preset.content
  void nextTick(() => composerInput.value?.focus())
}

function insertSelectedCode(): void {
  const current = draft.value
  if (!current) return
  const selection = props.selectedCode?.()
  if (!selection?.trim()) {
    current.error = '请先在编辑器里选中需要讨论的几行代码。'
    return
  }
  const question = `${current.content.trimEnd()}\n\n选中的代码片段\n${selection}`.trimStart()
  if (question.length > 4000) {
    current.error = '问题和代码片段合计最多 4000 字符，请缩短选中的代码。'
    return
  }
  current.error = ''
  current.includeWorkspace = false
  current.content = question
  void nextTick(() => composerInput.value?.focus())
}
const hasNoSessions = computed(() => sessionsQuery.status.value === 'success'
  && activeSessionId.value === null && sessions.value.length === 0)

/** 仅统计当前加载的回复。历史页可能还未加载，安全模板不计入。 */
const hintLevel = computed(() => messages.value.reduce((highest, message) =>
  message.role === 'assistant' && message.mode !== 'fallback' ? Math.max(highest, message.hintLevel ?? 0) : highest, 0))
const clock = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
</script>

<template>
  <div class="tutoring-panel" :class="{ 'is-embedded': embedded }">
    <ApiState :status="policyQuery.status.value" :error="policyQuery.error.value" @retry="policyQuery.load" />

    <template v-if="policyQuery.status.value === 'success' && policy">
      <div v-if="!policy.enabled" class="chat-empty">
        <p>这项作业没有开启 AI 辅导。</p>
      </div>

      <div v-else class="tutor-grid">
        <div class="chat-col">
          <div v-if="!embedded || activeSessionId !== null" class="sessions">
            <div v-if="!embedded" class="session-btns" role="group" aria-label="辅导会话">
              <button
                v-for="session in sessions"
                :key="session.id"
                type="button"
                class="session-btn"
                :aria-pressed="activeSessionId === session.id"
                @click="selectSession(session.id)"
              >
                会话 · {{ new Date(session.createdAt).toLocaleDateString('zh-CN') }}
              </button>
            </div>
            <UiButton variant="quiet" :disabled="creatingSession || sendingSessionId !== null" @click="startSession">
              {{ creatingSession ? '正在创建…' : embedded ? '+ 新建求助' : '+ 新会话' }}
            </UiButton>
          </div>

          <ApiState v-if="sessionsQuery.status.value === 'error'" :status="sessionsQuery.status.value" :error="sessionsQuery.error.value" @retry="sessionsQuery.load" />
          <p v-if="sessionError" class="field-error" role="alert">{{ sessionError }}</p>

          <section v-if="embedded && hasNoSessions" class="chat-empty">
            <p>描述你卡住的地方，以及已经试过的办法。</p>
            <UiButton variant="primary" :disabled="creatingSession" @click="startSession">
              {{ creatingSession ? '正在创建…' : '开始求助' }}
            </UiButton>
          </section>

          <section v-if="activeSessionId !== null" ref="chat" class="chat" aria-label="辅导对话">
            <UiButton v-if="thread.hasEarlier.value" variant="quiet" class="earlier-messages"
              :disabled="thread.earlierStatus.value === 'loading'" @click="thread.loadEarlier">
              {{ thread.earlierStatus.value === 'loading' ? '正在加载更早消息…' : '加载更早消息' }}
            </UiButton>
            <ApiState v-if="thread.earlierStatus.value === 'error'" :status="thread.earlierStatus.value"
              :error="thread.earlierError.value" @retry="thread.loadEarlier" />
            <ApiState v-if="thread.status.value === 'error' || (thread.status.value === 'loading' && messages.length === 0)"
              :status="thread.status.value" :error="thread.error.value" @retry="thread.refresh" />
            <ol v-if="messages.length > 0 || waitingHere" class="thread">
              <li v-for="message in messages" :key="message.id" :class="['msg', message.role]">
                <span class="lv">
                  {{ message.role === 'student' ? '我' : 'AI 助教' }}<template v-if="message.role === 'assistant' && message.mode !== null"> · {{ MODE_LABELS[message.mode] ?? message.mode }}<template v-if="message.hintLevel !== null"> · 第 {{ message.hintLevel }} 级</template></template>
                </span>
                <p v-if="message.content !== null" class="msg-text">{{ message.content }}</p>
                <p v-else class="msg-text meta">内容已过保留期限，不可查看。</p>
                <div v-if="message.role === 'assistant' && message.citations.length > 0" class="msg-cites">
                  <span>参考讲义</span>
                  <button v-for="citation in message.citations" :key="citation.resourceId" type="button" class="cite"
                    aria-haspopup="dialog" @click="openCitation(citation, $event)">{{ citation.title }}</button>
                </div>
                <span v-if="message.role === 'student'" class="meta msg-time">{{ clock(message.createdAt) }}</span>
              </li>
              <li v-if="waitingHere" class="msg assistant pending" aria-live="polite">
                <span class="lv">AI 助教 · {{ poll.request.value?.status === 'running' ? '生成中' : '排队中' }}</span>
                <p class="msg-text meta" role="status">回复经过审核后才会显示。</p>
              </li>
            </ol>
            <p v-else-if="thread.status.value === 'success'" class="chat-empty-text">
              {{ embedded ? '选一个快捷提问，或直接描述你卡住的地方。' : '还没有提问。描述你遇到的问题，或请 AI 解释一个概念。' }}
            </p>
          </section>
          <p v-if="otherSessionActivity" class="meta session-activity" role="status">{{ otherSessionActivity }}</p>
          <div v-if="poll.state.value === 'error'" class="meta session-activity">
            <span role="status">AI 请求状态暂时无法读取。</span>
            <UiButton variant="quiet" @click="retryPolling">重试查询</UiButton>
          </div>

          <form v-if="draft" :key="activeSessionId ?? undefined" class="composer" @submit.prevent="send">
            <fieldset :disabled="sendingHere || waitingHere" class="composer-fields" aria-label="向 AI 助教提问">
              <div v-if="!embedded" class="seg" role="radiogroup" aria-label="提问方式">
                <label v-for="(label, key) in ACTION_LABELS" :key="key" class="seg-option" :aria-pressed="draft.action === key">
                  <input v-model="draft.action" type="radio" :value="key" name="tutoring-action" />
                  <span>{{ label }}</span>
                </label>
              </div>
              <div v-else class="quick-asks" role="group" aria-label="快捷提问">
                <button
                  v-for="preset in QUICK_ASKS"
                  :key="preset.label"
                  type="button"
                  class="quick-ask"
                  @click="applyQuickAsk(preset)"
                >
                  {{ preset.label }}
                </button>
              </div>
              <UiField label="你的问题" col>
                <textarea ref="composerInput" v-model="draft.content" rows="2" maxlength="4000" required placeholder="描述现象与具体疑问" />
              </UiField>
              <UiField :label="`实际尝试（第 ${policy.requireAttemptFromLevel} 级起必填）`" col>
                <textarea v-model="draft.attempt" rows="2" maxlength="8000" placeholder="已经做过什么、结果如何" />
              </UiField>
              <div v-if="prepareWorkspace" class="quick-asks">
                <label><input v-model="draft.includeWorkspace" type="checkbox" /> 附上当前工作区（最多 16 KiB）</label>
                <UiButton v-if="selectedCode" type="button" variant="secondary" @click="insertSelectedCode">插入选中代码</UiButton>
              </div>
              <p v-if="draft.error" class="field-error" role="alert">{{ draft.error }}</p>
              <div class="composer-foot">
                <span class="meta">提示最多 {{ policy.maxHintLevel }} 级</span>
                <UiButton variant="primary" type="submit" :disabled="sendingBlocked">
                  {{ waitingHere ? '等待回复…' : sendingHere ? '正在发送…' : '发送' }}
                </UiButton>
              </div>
            </fieldset>
          </form>
        </div>

        <aside class="col side">
          <section class="sec">
            <h2>本作业的辅导规则</h2>
            <p class="lead-sm">{{ policy.boundaryText }}</p>
            <dl class="facts">
              <div><dt>已显示最高层级</dt><dd><span class="levels"><i v-for="level in policy.maxHintLevel" :key="level" :class="{ on: level <= hintLevel }" /></span>第 {{ hintLevel }}/{{ policy.maxHintLevel }} 级</dd></div>
              <div><dt>完整答案</dt><dd>{{ policy.restrictCompleteSolution ? '不提供' : '可提供' }}</dd></div>
              <div><dt>代码块</dt><dd>{{ policy.allowCodeBlocks ? '允许' : '不生成' }}</dd></div>
              <div><dt>需附尝试</dt><dd>第 {{ policy.requireAttemptFromLevel }} 级起</dd></div>
              <div><dt>次数上限</dt><dd>每天 {{ policy.dailyAssignmentLimit }} 次 · 每分钟 {{ policy.perMinuteLimit }} 次</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </template>

    <div class="tutor-follow-up">
      <RouterLink v-if="hasTeacher" class="quiet-link" :to="{ name: 'student-help-new', params: { id: assignmentId } }">问老师</RouterLink>
      <RouterLink v-else-if="offering" class="quiet-link" :to="{ name: 'course', params: { offeringId: offering.id } }">查看课程讲义</RouterLink>
      <ApiState v-else-if="offeringQuery.status.value === 'error'" status="error" :error="offeringQuery.error.value" @retry="offeringQuery.load" />
    </div>
    <TutoringResourceDialog v-if="activeCitation" :key="activeCitation.resourceId"
      :resource-id="activeCitation.resourceId" :title="activeCitation.title" :offering-id="offeringId ?? offering?.id"
      :can-resume-editing="Boolean(resumeEditing)" @close="closeCitation" />
  </div>
</template>

<style scoped>
.tutor-follow-up:not(:empty) { margin: 0.75rem 0; }
.chat { overflow-anchor: none; }
.earlier-messages { display: flex; margin: 0 auto 8px; }
.session-activity { margin: 4px 0; padding: 0 14px; }
.msg-cites {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 10px;
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.cite {
  min-height: 44px;
  max-width: 100%;
  padding: 4px 0;
  border: 0;
  color: var(--blue-text);
  background: none;
  font: inherit;
  text-align: start;
  text-decoration: underline;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
  cursor: pointer;
}
</style>
