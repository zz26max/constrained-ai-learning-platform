import { tutoringApi } from '../../api'
import type { LearningEventsWrite } from '../../api/tutoring'
import { useAuthStore } from '../../stores/auth'

type LearningEvent = LearningEventsWrite['events'][number]

/** 编辑器事件 payload 的 activeFile 枚举（契约 Event_editor_opened）。 */
export const EDITOR_FILES = ['index.html', 'style.css', 'script.js', 'answer.sql', 'answer.md'] as const
export type EditorFile = (typeof EDITOR_FILES)[number]

export type TrackInput =
  | { type: 'chapter_opened'; offeringId: string; chapterId: string }
  | { type: 'resource_opened'; offeringId: string; resourceId: string }
  | { type: 'editor_opened'; offeringId: string; assignmentId: string; activeFile: EditorFile }
  | { type: 'preview_opened'; offeringId: string; assignmentId: string; viewport: 'desktop' | 'mobile' }

const FLUSH_SIZE = 10
const FLUSH_DELAY_MS = 10_000
const RETRY_DELAY_MS = 30_000
const MAX_BATCH = 50
const MAX_ATTEMPTS = 3
const SESSION_KEY = 'lp_learning_session'

interface Pending { readonly event: LearningEvent; attempts: number }

const state = {
  queue: [] as Pending[],
  keys: new Set<string>(),
  timer: null as ReturnType<typeof setTimeout> | null,
  flushing: false,
  listening: false,
}

function schedule(delay: number): void {
  if (state.timer !== null) return
  state.timer = setTimeout(() => {
    state.timer = null
    void flush()
  }, delay)
}

/** 会话标识：同标签页刷新保持，新标签页新会话；存储不可用时退化为随机值。 */
function sessionIdentifier(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing !== null) return existing
    const created = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

function subjectKey(input: TrackInput): string {
  switch (input.type) {
    case 'chapter_opened': return `${input.type}:${input.offeringId}:${input.chapterId}`
    case 'resource_opened': return `${input.type}:${input.offeringId}:${input.resourceId}`
    case 'editor_opened': return `${input.type}:${input.assignmentId}:${input.activeFile}`
    case 'preview_opened': return `${input.type}:${input.assignmentId}:${input.viewport}`
  }
}

function buildEvent(input: TrackInput): LearningEvent | null {
  const base = { eventId: crypto.randomUUID(), sessionId: sessionIdentifier(), occurredAt: new Date().toISOString(), offeringId: input.offeringId }
  switch (input.type) {
    case 'chapter_opened':
      return { ...base, chapterId: input.chapterId, type: 'chapter_opened', payload: {} }
    case 'resource_opened':
      return { ...base, type: 'resource_opened', payload: { resourceId: input.resourceId } }
    case 'editor_opened':
      return { ...base, assignmentId: input.assignmentId, type: 'editor_opened', payload: { activeFile: input.activeFile } }
    case 'preview_opened':
      return { ...base, assignmentId: input.assignmentId, type: 'preview_opened', payload: { viewport: input.viewport } }
  }
}

/**
 * 记录一个学习事件（DEVELOPMENT §8.1 客户端来源）：未认证丢弃；
 * 同一会话内同一对象重复打开只上报一次；失败退避重试，超过 3 次丢弃。
 */
export function trackLearningEvent(input: TrackInput): void {
  const auth = useAuthStore()
  if (auth.phase !== 'authenticated') return
  const key = subjectKey(input)
  if (state.keys.has(key)) return
  const event = buildEvent(input)
  if (event === null) return
  state.keys.add(key)
  state.queue.push({ event, attempts: 0 })
  ensureListeners()
  if (state.queue.length >= FLUSH_SIZE) void flush()
  else schedule(FLUSH_DELAY_MS)
}

async function flush(): Promise<void> {
  if (state.flushing || state.queue.length === 0) return
  const auth = useAuthStore()
  if (auth.phase !== 'authenticated') {
    state.queue = []
    return
  }
  state.flushing = true
  try {
    const csrfToken = auth.csrfToken ?? await auth.ensureCsrfToken()
    while (state.queue.length > 0) {
      const batch = state.queue.splice(0, MAX_BATCH)
      try {
        await tutoringApi().recordLearningEvents({ events: batch.map(item => item.event) }, { csrfToken })
      } catch {
        const keep = batch.filter(item => {
          item.attempts += 1
          return item.attempts < MAX_ATTEMPTS
        })
        state.queue.unshift(...keep)
        if (keep.length > 0) schedule(RETRY_DELAY_MS)
        break
      }
    }
  } finally {
    state.flushing = false
    if (state.queue.length > 0) schedule(FLUSH_DELAY_MS)
  }
}

function ensureListeners(): void {
  if (state.listening || typeof window === 'undefined') return
  state.listening = true
  window.addEventListener('pagehide', () => {
    const auth = useAuthStore()
    // 卸载时尽力冲刷：仅在有缓存令牌时发起，避免异步取令牌错过卸载窗口。
    if (auth.phase === 'authenticated' && auth.csrfToken !== null) void flush()
  })
}

/** 测试专用：清空队列、去重集与计时器；不影响 sessionStorage。 */
export function resetLearningEventReporter(): void {
  state.queue = []
  state.keys.clear()
  if (state.timer !== null) {
    clearTimeout(state.timer)
    state.timer = null
  }
  state.flushing = false
}
