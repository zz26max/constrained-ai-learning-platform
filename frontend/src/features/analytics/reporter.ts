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
/** fetch keepalive 的浏览器在途总预算为 64KB；留出余量，退出批次按条数与 UTF-8 字节共同切分。 */
const KEEPALIVE_BYTE_BUDGET = 60_000
const SESSION_KEY = 'lp_learning_session'

interface Pending { readonly event: LearningEvent; attempts: number }

const state = {
  queue: [] as Pending[],
  keys: new Set<string>(),
  timer: null as ReturnType<typeof setTimeout> | null,
  flushing: false,
  /** 退出冲刷请求在普通冲刷在途时置位：当前批次结束后，剩余队列以 keepalive 继续发送。 */
  exitRequested: false,
  listening: false,
}

/** 按条数上限与 UTF-8 字节预算切出一批；byteBudget 为 null 时不计字节。
    至少取一条，避免单事件超预算造成永久阻塞。纯函数，供测试。 */
export function takeEvents(queue: readonly Pending[], maxCount: number, byteBudget: number | null): { taken: Pending[]; rest: Pending[] } {
  const encoder = new TextEncoder()
  const taken: Pending[] = []
  let bytes = 0
  let index = 0
  while (index < queue.length && taken.length < maxCount) {
    const size = encoder.encode(JSON.stringify(queue[index]!.event)).length + 2
    if (taken.length > 0 && byteBudget !== null && bytes + size > byteBudget) break
    taken.push(queue[index]!)
    bytes += size
    index += 1
  }
  return { taken, rest: queue.slice(index) }
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

async function flush(keepalive = false): Promise<void> {
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
      // 队列唯一所有权在 flush 循环：普通与退出冲刷都从这里切批，
      // 事件按原 eventId 重试，不因同时发送而更换标识。
      const exitMode = keepalive || state.exitRequested
      const { taken, rest } = takeEvents(state.queue, MAX_BATCH, exitMode ? KEEPALIVE_BYTE_BUDGET : null)
      if (taken.length === 0) break
      state.queue = rest
      try {
        await tutoringApi().recordLearningEvents(
          { events: taken.map(item => item.event) },
          exitMode ? { csrfToken, keepalive: true } : { csrfToken },
        )
      } catch {
        // 失败按既有上限重试：保留原 eventId，放回队首；退出窗口无法等待，交给后续活跃时段。
        const keep = taken.filter(item => {
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
    state.exitRequested = false
    if (state.queue.length > 0) schedule(FLUSH_DELAY_MS)
  }
}

function exitFlush(): void {
  const auth = useAuthStore()
  // 卸载窗口尽力而为：仅在有缓存令牌时发起，不等待异步取令牌错过窗口。
  if (auth.phase !== 'authenticated' || auth.csrfToken === null) return
  if (state.flushing) {
    // 在途批次结束后由同一循环接管剩余队列，不并发发送、不丢弃。
    state.exitRequested = true
    return
  }
  void flush(true)
}

function ensureListeners(): void {
  if (state.listening || typeof window === 'undefined') return
  state.listening = true
  // 优先 visibilitychange 进入 hidden（切后台/收起更可靠），pagehide 兜底（直接关闭标签页）。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') exitFlush()
  })
  window.addEventListener('pagehide', exitFlush)
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
  state.exitRequested = false
}
