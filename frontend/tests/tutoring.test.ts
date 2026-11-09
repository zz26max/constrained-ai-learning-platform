import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import {
  mockTransport, resetMockAssignmentState, resetMockAuthState, resetMockCookies,
  resetMockCourseState, resetMockDashboardState, resetMockFeedbackState, resetMockTutoringState,
} from '../src/mocks/index'
import { P1B_IDS } from '../src/mocks/assignments'
import { P2_IDS as TUTORING_IDS } from '../src/mocks/tutoring'
import { ApiClient } from '../src/api/client'
import { TutoringApi } from '../src/api/tutoring'
import { registerTutoringApi, tutoringApi } from '../src/api'
import type { TransportRequest } from '../src/api/transport'
import { useTutoringPoll } from '../src/features/tutoring/use-tutoring-poll'

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

const assignmentPath = `/api/v1/assignments/${P1B_IDS.assignmentWeb}/ai-policy`
const sessionsPath = `/api/v1/assignments/${P1B_IDS.assignmentWeb}/tutoring-sessions`
const seededMessagesPath = `/api/v1/tutoring/sessions/${TUTORING_IDS.seededSession}/messages`

function messagesPath(sessionId: string): string {
  return `/api/v1/tutoring/sessions/${sessionId}/messages`
}

function requestPath(id: string): string {
  return `/api/v1/tutoring/requests/${id}`
}

/** 对种子会话发送并轮询到终态，返回 [请求Id, 终态DTO]。 */
async function sendAndWait(body: Record<string, unknown>): Promise<[string, Call]> {
  const accepted = await call('sendTutoringMessage', 'POST', seededMessagesPath, { body })
  if (accepted.status !== 202) return ['', accepted]
  const requestId = accepted.body.data.tutoringRequestId as string
  await call('getTutoringRequest', 'GET', requestPath(requestId))
  const terminal = await call('getTutoringRequest', 'GET', requestPath(requestId))
  return [requestId, terminal]
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
  csrf = ''
})

afterEach(() => {
  vi.useRealTimers()
})

describe('P2-A mock：政策与会话权限', () => {
  it('未登录读取政策返回 401', async () => {
    const result = await call('getAiPolicy', 'GET', assignmentPath)
    expect(result.status).toBe(401)
    expect(result.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('学生与授课教师都可读政策；教师不能读辅导会话', async () => {
    await loginAs('student.demo')
    const asStudent = await call('getAiPolicy', 'GET', assignmentPath)
    expect(asStudent.status).toBe(200)
    expect(asStudent.body.data.enabled).toBe(true)
    expect(asStudent.body.data.maxHintLevel).toBe(3)
    resetMockAuthState(); resetMockCookies(); csrf = ''
    await loginAs('teacher.demo')
    const asTeacher = await call('getAiPolicy', 'GET', assignmentPath)
    expect(asTeacher.status).toBe(200)
    expect((await call('listTutoringSessions', 'GET', sessionsPath)).status).toBe(403)
  })

  it('发送缺少 CSRF 令牌返回 403 CSRF_INVALID；不存在或他人会话返回 404', async () => {
    await loginAs('student.demo')
    const noCsrf = await call('sendTutoringMessage', 'POST', seededMessagesPath, { body: { action: 'ask', content: '问题' }, token: null })
    expect(noCsrf.status).toBe(403)
    expect(noCsrf.body.error.code).toBe('CSRF_INVALID')
    const unknown = await call('listTutoringMessages', 'GET', messagesPath('00000000-0000-4000-8000-000000009999'))
    expect(unknown.status).toBe(404)
  })

  it('未启用政策的作业返回 404', async () => {
    await loginAs('student.demo')
    const result = await call('getAiPolicy', 'GET', `/api/v1/assignments/${P1B_IDS.assignmentDraft}/ai-policy`)
    expect(result.status).toBe(404)
  })
})

describe('P2-A mock：请求状态机与分层约束', () => {
  beforeEach(async () => { await loginAs('student.demo') })

  it('发送返回 202 queued；两次轮询先 running 后 completed，助手消息落盘且 pendingRequestId 清空', async () => {
    const accepted = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'ask', content: '已经把 gap 改小还是溢出，接下来看哪里？' },
    })
    expect(accepted.status).toBe(202)
    expect(accepted.body.data.status).toBe('queued')
    const requestId = accepted.body.data.tutoringRequestId as string

    const first = await call('getTutoringRequest', 'GET', requestPath(requestId))
    expect(first.body.data.status).toBe('running')

    const second = await call('getTutoringRequest', 'GET', requestPath(requestId))
    expect(second.body.data.status).toBe('completed')
    expect(second.body.data.result.mode).toBe('guided_question')
    expect(second.body.data.result.hintLevel).toBe(1)

    const messages = await call('listTutoringMessages', 'GET', seededMessagesPath)
    expect(messages.body.data.total).toBe(4)
    const assistant = messages.body.data.items.at(-1)
    expect(assistant.role).toBe('assistant')
    expect(assistant.tutoringRequestId).toBe(requestId)

    const sessions = await call('listTutoringSessions', 'GET', sessionsPath)
    expect(sessions.body.data.items.find((item: any) => item.id === TUTORING_IDS.seededSession).pendingRequestId).toBeNull()
  })

  it('在途请求未完成前重复发送返回 409 AI_REQUEST_IN_PROGRESS 与 pendingRequestId', async () => {
    const accepted = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'ask', content: '菜单溢出该怎么排查？' },
    })
    const conflict = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'concept', content: '顺便讲讲盒模型' },
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('AI_REQUEST_IN_PROGRESS')
    expect(conflict.body.error.details.pendingRequestId).toBe(accepted.body.data.tutoringRequestId)
  })

  it('next_hint 从第 2 层起要求实际尝试；补充后逐层交付，超过 maxHintLevel 返回 409 HINT_LIMIT_REACHED', async () => {
    const rejected = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'next_hint', content: '给我下一层提示' },
    })
    expect(rejected.status).toBe(422)
    expect(rejected.body.error.details.fields[0].field).toBe('studentAttempt')

    const [, level2] = await sendAndWait({ action: 'next_hint', content: '继续下一层', studentAttempt: '缩小了 gap，仍然溢出' })
    expect(level2.body.data.result.hintLevel).toBe(2)
    expect(level2.body.data.result.mode).toBe('debug_hint')

    const [, level3] = await sendAndWait({ action: 'next_hint', content: '再下一层', studentAttempt: '加了边框观察，子项没有收缩' })
    expect(level3.body.data.result.hintLevel).toBe(3)

    const capped = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'next_hint', content: '还要下一层', studentAttempt: '已尝试三层' },
    })
    expect(capped.status).toBe(409)
    expect(capped.body.error.code).toBe('HINT_LIMIT_REACHED')
  })

  it('索要完整实现触发政策回退：终态 fallback、模式固定、不推进层次', async () => {
    const [, fallback] = await sendAndWait({ action: 'ask', content: '直接给我完整代码吧' })
    expect(fallback.body.data.status).toBe('fallback')
    expect(fallback.body.data.result.mode).toBe('fallback')
    expect(fallback.body.data.result.content).toContain('不能直接提供完整实现')

    const messages = await call('listTutoringMessages', 'GET', seededMessagesPath)
    const assistant = messages.body.data.items.at(-1)
    expect(assistant.mode).toBe('fallback')
    expect(assistant.hintLevel).toBeNull()
    expect(assistant.citations).toEqual([])
    expect(fallback.body.data.result.citations).toEqual([])
    const seededAssistant = messages.body.data.items.find(item => item.role === 'assistant' && item.sequence === 2)
    expect(seededAssistant.citations[0]?.title).toBe('CSS 尺寸约束与溢出')

    const [, stillLow] = await sendAndWait({ action: 'ask', content: '那我该先检查什么？' })
    expect(stillLow.body.data.result.hintLevel).toBe(1)
  })

  it('新建会话共享提示进度：新会话内 ask 仍停在第 1 层', async () => {
    const created = await call('createTutoringSession', 'POST', '/api/v1/tutoring/sessions', {
      body: { assignmentId: P1B_IDS.assignmentWeb },
    })
    expect(created.status).toBe(201)
    const sessionId = created.body.data.id as string
    const accepted = await call('sendTutoringMessage', 'POST', messagesPath(sessionId), {
      body: { action: 'ask', content: '换个会话继续问：先看哪里？' },
    })
    expect(accepted.status).toBe(202)
    const requestId = accepted.body.data.tutoringRequestId as string
    await call('getTutoringRequest', 'GET', requestPath(requestId))
    const terminal = await call('getTutoringRequest', 'GET', requestPath(requestId))
    expect(terminal.body.data.result.hintLevel).toBe(1)
    const messages = await call('listTutoringMessages', 'GET', messagesPath(sessionId))
    expect(messages.body.data.items).toHaveLength(2)
  })
})

describe('useTutoringPoll：退避轮询与停止', () => {
  beforeEach(async () => { await loginAs('student.demo') })

  function mountPoll(requestId: string) {
    const Harness = defineComponent({
      setup() {
        const poll = useTutoringPoll()
        poll.poll(requestId)
        return { poll }
      },
    })
    const wrapper = mount(Harness)
    return { wrapper, poll: wrapper.vm.poll as unknown as ReturnType<typeof useTutoringPoll> }
  }

  it('1s 起步、退避至终态即停', async () => {
    vi.useFakeTimers()
    const accepted = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'ask', content: '先从哪里观察？' },
    })
    const requestId = accepted.body.data.tutoringRequestId as string

    const { poll } = mountPoll(requestId)
    expect(poll.state.value).toBe('polling')

    await vi.advanceTimersByTimeAsync(1000)
    expect(poll.request.value?.status).toBe('running')
    await vi.advanceTimersByTimeAsync(2000)
    expect(poll.request.value?.status).toBe('completed')
    expect(poll.state.value).toBe('done')
    const spy = vi.spyOn(tutoringApi(), 'getTutoringRequest')
    await vi.advanceTimersByTimeAsync(20000)
    expect(spy).toHaveBeenCalledTimes(0)
    spy.mockRestore()
  })

  it('stop 之后不再发请求（模拟离开页面）', async () => {
    vi.useFakeTimers()
    const accepted = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'ask', content: '离开页面前的问题' },
    })
    const requestId = accepted.body.data.tutoringRequestId as string

    const { poll } = mountPoll(requestId)
    poll.stop()
    expect(poll.state.value).toBe('idle')
    const spy = vi.spyOn(tutoringApi(), 'getTutoringRequest')
    await vi.advanceTimersByTimeAsync(20000)
    expect(spy).toHaveBeenCalledTimes(0)
    spy.mockRestore()
  })
})
