import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  mockTransport, resetMockAnalyticsState, resetMockAssignmentState, resetMockAuthState, resetMockCookies,
  resetMockCourseState, resetMockDashboardState, resetMockFeedbackState, resetMockTutoringState,
} from '../src/mocks/index'
import { ApiClient } from '../src/api/client'
import { AuthApi } from '../src/api/auth'
import { TutoringApi } from '../src/api/tutoring'
import { registerAuthApi, registerTutoringApi, tutoringApi } from '../src/api'
import type { TransportRequest } from '../src/api/transport'
import { resetLearningEventReporter, takeEvents, trackLearningEvent } from '../src/features/analytics/reporter'
import { useAuthStore } from '../src/stores/auth'

interface Call { status: number; body: any }

let csrf = ''

async function call(operationId: string, method: TransportRequest['method'], path: string, options: { body?: unknown; token?: string | null } = {}): Promise<Call> {
  const headers: Record<string, string> = {}
  const token = options.token === undefined ? csrf : options.token
  if (token) headers['X-CSRF-Token'] = token
  const response = await mockTransport.request({
    operationId, method, path, headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  return { status: response.status, body: JSON.parse(response.bodyText) }
}

async function loginAs(username: string): Promise<void> {
  const pre = await call('getCsrfToken', 'GET', '/api/v1/auth/csrf', { token: null })
  const result = await call('login', 'POST', '/api/v1/auth/login', {
    token: pre.body.data.csrfToken, body: { username, password: 'mock-demo-pass' },
  })
  csrf = result.body.data.csrfToken
}

const uuid = (value: number) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
const OFFERING = uuid(201), CHAPTER = uuid(301), RESOURCE = uuid(401), ASSIGNMENT = uuid(701)
const SESSION = uuid(999)
const OCCURRED = '2026-10-24T10:00:00Z'

const chapterEvent = {
  eventId: uuid(1001), sessionId: SESSION, occurredAt: OCCURRED,
  offeringId: OFFERING, chapterId: CHAPTER, type: 'chapter_opened', payload: {},
}
const editorEvent = {
  eventId: uuid(1002), sessionId: SESSION, occurredAt: OCCURRED,
  offeringId: OFFERING, assignmentId: ASSIGNMENT, type: 'editor_opened', payload: { activeFile: 'script.js' },
}

beforeAll(() => {
  registerTutoringApi(new TutoringApi(new ApiClient(mockTransport)))
})

beforeEach(() => {
  resetMockAuthState()
  resetMockCookies()
  resetMockCourseState()
  resetMockAssignmentState()
  resetMockFeedbackState()
  resetMockDashboardState()
  resetMockTutoringState()
  resetMockAnalyticsState()
  csrf = ''
})

describe('P2-B mock：recordLearningEvents', () => {
  it('未登录返回 401', async () => {
    const result = await call('recordLearningEvents', 'POST', '/api/v1/me/learning-events', { body: { events: [chapterEvent] }, token: null })
    expect(result.status).toBe(401)
  })

  it('合法批量返回 acceptedCount，重复 eventId 计入 duplicateCount', async () => {
    await loginAs('student.demo')
    const first = await call('recordLearningEvents', 'POST', '/api/v1/me/learning-events', { body: { events: [chapterEvent, editorEvent] } })
    expect(first.status).toBe(200)
    expect(first.body.data).toEqual({ acceptedCount: 2, duplicateCount: 0 })

    const repeat = await call('recordLearningEvents', 'POST', '/api/v1/me/learning-events', { body: { events: [chapterEvent, editorEvent] } })
    expect(repeat.body.data).toEqual({ acceptedCount: 0, duplicateCount: 2 })
  })

  it('非法事件整批 422：未知类型、缺 chapterId、白名单外 activeFile、超过 50 条', async () => {
    await loginAs('student.demo')
    const path = '/api/v1/me/learning-events'
    expect((await call('recordLearningEvents', 'POST', path, { body: { events: [{ ...chapterEvent, type: 'heartbeat' }] } })).status).toBe(422)
    expect((await call('recordLearningEvents', 'POST', path, { body: { events: [{ ...chapterEvent, chapterId: undefined }] } })).status).toBe(422)
    expect((await call('recordLearningEvents', 'POST', path, { body: { events: [{ ...editorEvent, payload: { activeFile: 'evil.js' } }] } })).status).toBe(422)
    const flood = Array.from({ length: 51 }, (_, index) => ({ ...chapterEvent, eventId: uuid(2000 + index) }))
    expect((await call('recordLearningEvents', 'POST', path, { body: { events: flood } })).status).toBe(422)
  })

  it('缺少 CSRF 令牌返回 403', async () => {
    await loginAs('student.demo')
    const result = await call('recordLearningEvents', 'POST', '/api/v1/me/learning-events', { body: { events: [chapterEvent] }, token: null })
    expect(result.status).toBe(403)
    expect(result.body.error.code).toBe('CSRF_INVALID')
  })
})

describe('P2-B 上报器：批量冲刷、会话去重与失败重试', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    registerAuthApi(new AuthApi(new ApiClient(mockTransport)))
    const auth = useAuthStore()
    auth.phase = 'authenticated'
    auth.csrfToken = 'test-csrf-token'
    resetLearningEventReporter()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function spyRecord() {
    return vi.spyOn(tutoringApi(), 'recordLearningEvents').mockResolvedValue({ data: { acceptedCount: 1, duplicateCount: 0 }, requestId: 'req-1' })
  }

  it('10 秒定时冲刷一批事件，字段符合契约', async () => {
    const spy = spyRecord()
    trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: CHAPTER })
    expect(spy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(spy).toHaveBeenCalledTimes(1)
    const [body, options] = spy.mock.calls[0]!
    expect(body.events).toHaveLength(1)
    const event = body.events[0] as Record<string, unknown>
    expect(event.type).toBe('chapter_opened')
    expect(event.offeringId).toBe(OFFERING)
    expect(event.chapterId).toBe(CHAPTER)
    expect(event.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof event.occurredAt).toBe('string')
    expect(options?.csrfToken).toBe('test-csrf-token')
  })

  it('同一会话重复打开同一章节只上报一次', async () => {
    const spy = spyRecord()
    trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: CHAPTER })
    trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: CHAPTER })
    trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: uuid(302) })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(spy).toHaveBeenCalledTimes(1)
    expect((spy.mock.calls[0]![0] as { events: unknown[] }).events).toHaveLength(2)
  })

  it('失败后退避 30 秒重试，成功后不再发送', async () => {
    const spy = spyRecord()
    spy.mockRejectedValueOnce(new Error('网络不可用'))
    trackLearningEvent({ type: 'editor_opened', offeringId: OFFERING, assignmentId: ASSIGNMENT, activeFile: 'index.html' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(spy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(spy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(spy).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('未认证时丢弃事件且不发送', async () => {
    const auth = useAuthStore()
    auth.phase = 'anonymous'
    const spy = spyRecord()
    trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: CHAPTER })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('P2-B 上报器：退出冲刷与 keepalive（F5）', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    registerAuthApi(new AuthApi(new ApiClient(mockTransport)))
    const auth = useAuthStore()
    auth.phase = 'authenticated'
    auth.csrfToken = 'test-csrf-token'
    resetLearningEventReporter()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  function spyRecord() {
    return vi.spyOn(tutoringApi(), 'recordLearningEvents').mockResolvedValue({ data: { acceptedCount: 1, duplicateCount: 0 }, requestId: 'req-1' })
  }

  function goHidden(): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('页面进入 hidden 时立即冲刷并携带 keepalive 标记', async () => {
    const spy = spyRecord()
    trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: CHAPTER })
    goHidden()
    await vi.advanceTimersByTimeAsync(0)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![1]?.keepalive).toBe(true)
    expect(spy.mock.calls[0]![1]?.csrfToken).toBe('test-csrf-token')
  })

  it('pagehide 兜底冲刷同样携带 keepalive', async () => {
    const spy = spyRecord()
    trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: CHAPTER })
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![1]?.keepalive).toBe(true)
  })

  it('退出时普通冲刷在途：剩余队列由同一循环以 keepalive 续发，事件标识不重复', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const spy = spyRecord()
    spy.mockImplementationOnce(async () => { await gate; return { data: { acceptedCount: 1, duplicateCount: 0 }, requestId: 'req-gate' } })
    for (let index = 0; index < 60; index += 1) {
      trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: uuid(300 + index) })
    }
    expect(spy).toHaveBeenCalledTimes(1)
    goHidden()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1]![1]?.keepalive).toBe(true)
    const firstIds = (spy.mock.calls[0]![0] as { events: Array<{ eventId: string }> }).events.map(event => event.eventId)
    const secondIds = (spy.mock.calls[1]![0] as { events: Array<{ eventId: string }> }).events.map(event => event.eventId)
    expect(firstIds).toHaveLength(10)
    expect(secondIds).toHaveLength(50)
    expect(new Set([...firstIds, ...secondIds]).size).toBe(60)
  })

  it('重试沿用原 eventId，不更换标识', async () => {
    const spy = spyRecord()
    spy.mockRejectedValueOnce(new Error('网络不可用'))
    trackLearningEvent({ type: 'chapter_opened', offeringId: OFFERING, chapterId: CHAPTER })
    await vi.advanceTimersByTimeAsync(10_000 + 30_000 + 1)
    expect(spy).toHaveBeenCalledTimes(2)
    const firstId = (spy.mock.calls[0]![0] as { events: Array<{ eventId: string }> }).events[0]!.eventId
    const retryId = (spy.mock.calls[1]![0] as { events: Array<{ eventId: string }> }).events[0]!.eventId
    expect(retryId).toBe(firstId)
  })

  it('takeEvents 按条数与字节预算共同切批，至少保留一条', () => {
    const event = (index: number) => ({
      event: { eventId: `id-${index}`, sessionId: 's', occurredAt: '2026-10-24T10:00:00Z', offeringId: OFFERING, chapterId: CHAPTER, type: 'chapter_opened' as const, payload: {} },
      attempts: 0,
    })
    const queue = Array.from({ length: 5 }, (_, index) => event(index))
    const all = takeEvents(queue, 50, null)
    expect(all.taken).toHaveLength(5)
    expect(all.rest).toHaveLength(0)

    const limited = takeEvents(queue, 3, null)
    expect(limited.taken).toHaveLength(3)
    expect(limited.rest).toHaveLength(2)

    // 字节预算切分：每个事件约 200 字节，400 字节预算装不下三条。
    const budgeted = takeEvents(queue, 50, 400)
    expect(budgeted.taken.length).toBeGreaterThanOrEqual(1)
    expect(budgeted.taken.length).toBeLessThanOrEqual(2)
    expect(budgeted.taken.length + budgeted.rest.length).toBe(5)

    const oversize = [event(99)]
    const single = takeEvents(oversize, 50, 1)
    expect(single.taken).toHaveLength(1)
  })
})
