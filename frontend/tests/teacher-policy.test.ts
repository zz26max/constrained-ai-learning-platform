import { beforeEach, describe, expect, it } from 'vitest'
import {
  mockTransport, resetMockAssignmentState, resetMockAuthState, resetMockCookies,
  resetMockCourseState, resetMockDashboardState, resetMockFeedbackState, resetMockTutoringState,
} from '../src/mocks/index'
import { P1B_IDS } from '../src/mocks/assignments'
import { P2_IDS } from '../src/mocks/tutoring'
import type { TransportRequest } from '../src/api/transport'

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

const policyPath = `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/ai-policy`
const studentPolicyPath = `/api/v1/assignments/${P1B_IDS.assignmentWeb}/ai-policy`
const seededMessagesPath = `/api/v1/tutoring/sessions/${P2_IDS.seededSession}/messages`

const validUpdate = (baseVersion: number) => ({
  baseVersion,
  enabled: true,
  allowedActions: ['ask', 'concept', 'next_hint'],
  allowedModes: ['concept', 'debug_hint', 'guided_question'],
  restrictCompleteSolution: true,
  allowCodeBlocks: false,
  maxHintLevel: 3,
  requireAttemptFromLevel: 2,
  dailyAssignmentLimit: 12,
  maxOutputTokens: 800,
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

describe('P2-A mock：教师政策权限与校验', () => {
  it('学生与未登录不能访问教师政策操作', async () => {
    expect((await call('getTeacherAiPolicy', 'GET', policyPath)).status).toBe(401)
    await loginAs('student.demo')
    expect((await call('getTeacherAiPolicy', 'GET', policyPath)).status).toBe(403)
    expect((await call('updateAiPolicy', 'PUT', policyPath, { body: validUpdate(1) })).status).toBe(403)
  })

  it('baseVersion 过期返回 409 AI_POLICY_VERSION_CONFLICT', async () => {
    await loginAs('teacher.demo')
    const result = await call('updateAiPolicy', 'PUT', policyPath, { body: validUpdate(0) })
    expect(result.status).toBe(409)
    expect(result.body.error.code).toBe('AI_POLICY_VERSION_CONFLICT')
  })

  it('平台固定项与只读上限被拒绝：allowCodeBlocks/restrictCompleteSolution/超上限/篡改只读值', async () => {
    await loginAs('teacher.demo')
    expect((await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), allowCodeBlocks: true } })).status).toBe(422)
    expect((await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), restrictCompleteSolution: false } })).status).toBe(422)
    expect((await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), dailyAssignmentLimit: 13 } })).status).toBe(422)
    expect((await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), maxOutputTokens: 900 } })).status).toBe(422)
    expect((await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), dailyUserLimit: 99 } })).status).toBe(422)
  })

  it('启用时空动作或空模式返回 422', async () => {
    await loginAs('teacher.demo')
    expect((await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), allowedActions: [] } })).status).toBe(422)
    expect((await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), allowedModes: [] } })).status).toBe(422)
  })
})

describe('P2-A mock：政策更新对学生侧生效', () => {
  it('收紧 maxHintLevel=2 后版本升为 2，学生提示第 3 层被拒', async () => {
    await loginAs('teacher.demo')
    const updated = await call('updateAiPolicy', 'PUT', policyPath, {
      body: { ...validUpdate(1), maxHintLevel: 2 },
    })
    expect(updated.status).toBe(200)
    expect(updated.body.data.version).toBe(2)
    expect(updated.body.data.maxHintLevel).toBe(2)

    resetMockAuthState(); resetMockCookies(); csrf = ''
    await loginAs('student.demo')
    const policy = await call('getAiPolicy', 'GET', studentPolicyPath)
    expect(policy.body.data.version).toBe(2)

    const level2 = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'next_hint', content: '下一层', studentAttempt: '已缩小 gap' },
    })
    expect(level2.status).toBe(202)
    const requestId = level2.body.data.tutoringRequestId as string
    await call('getTutoringRequest', 'GET', `/api/v1/tutoring/requests/${requestId}`)
    const terminal = await call('getTutoringRequest', 'GET', `/api/v1/tutoring/requests/${requestId}`)
    expect(terminal.body.data.result.hintLevel).toBe(2)

    const capped = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'next_hint', content: '还要下一层', studentAttempt: '已到第 2 层' },
    })
    expect(capped.status).toBe(409)
    expect(capped.body.error.code).toBe('HINT_LIMIT_REACHED')
  })

  it('停用政策后学生发送返回 409 AI_DISABLED', async () => {
    await loginAs('teacher.demo')
    await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), enabled: false } })

    resetMockAuthState(); resetMockCookies(); csrf = ''
    await loginAs('student.demo')
    const rejected = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'ask', content: '还能问吗？' },
    })
    expect(rejected.status).toBe(409)
    expect(rejected.body.error.code).toBe('AI_DISABLED')
  })

  it('移除 next_hint 动作后该动作被 422 拒绝', async () => {
    await loginAs('teacher.demo')
    await call('updateAiPolicy', 'PUT', policyPath, { body: { ...validUpdate(1), allowedActions: ['ask', 'concept'] } })

    resetMockAuthState(); resetMockCookies(); csrf = ''
    await loginAs('student.demo')
    const rejected = await call('sendTutoringMessage', 'POST', seededMessagesPath, {
      body: { action: 'next_hint', content: '下一层', studentAttempt: '已尝试' },
    })
    expect(rejected.status).toBe(422)
    expect(rejected.body.error.details.fields[0].field).toBe('action')
  })
})
