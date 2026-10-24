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

const createPath = '/api/v1/me/help-requests'
const listPath = '/api/v1/me/help-requests'
const validBody = {
  assignmentId: P1B_IDS.assignmentWeb,
  title: '溢出问题求助',
  content: '480px 以下导航溢出。',
  studentAttempt: '缩小 gap 无效。',
}

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

describe('P2-A mock：求助权限', () => {
  it('未登录返回 401；教师无权创建或读取学生求助', async () => {
    expect((await call('listHelpRequests', 'GET', listPath)).status).toBe(401)
    await loginAs('teacher.demo')
    expect((await call('listHelpRequests', 'GET', listPath)).status).toBe(403)
    expect((await call('createHelpRequest', 'POST', createPath, { body: validBody })).status).toBe(403)
  })

  it('缺少 CSRF 令牌返回 403 CSRF_INVALID', async () => {
    await loginAs('student.demo')
    const result = await call('createHelpRequest', 'POST', createPath, { body: validBody, token: null })
    expect(result.status).toBe(403)
    expect(result.body.error.code).toBe('CSRF_INVALID')
  })
})

describe('P2-A mock：求助创建校验', () => {
  beforeEach(async () => { await loginAs('student.demo') })

  it('缺少实际尝试返回 422 studentAttempt', async () => {
    const result = await call('createHelpRequest', 'POST', createPath, {
      body: { ...validBody, studentAttempt: '' },
    })
    expect(result.status).toBe(422)
    expect(result.body.error.details.fields[0].field).toBe('studentAttempt')
  })

  it('词表外或重复标签返回 422 issueTags', async () => {
    const bad = await call('createHelpRequest', 'POST', createPath, {
      body: { ...validBody, issueTags: ['made_up_tag'] },
    })
    expect(bad.status).toBe(422)
    const duplicated = await call('createHelpRequest', 'POST', createPath, {
      body: { ...validBody, issueTags: ['box_model', 'box_model'] },
    })
    expect(duplicated.status).toBe(422)
  })

  it('共享非本人或未出结果的 AI 片段返回 422', async () => {
    const accepted = await call('sendTutoringMessage', 'POST', `/api/v1/tutoring/sessions/${P2_IDS.seededSession}/messages`, {
      body: { action: 'ask', content: '先看哪里？' },
    })
    const pendingId = accepted.body.data.tutoringRequestId as string
    const pending = await call('createHelpRequest', 'POST', createPath, {
      body: { ...validBody, sharedTutoringRequestIds: [pendingId] },
    })
    expect(pending.status).toBe(422)
    expect(pending.body.error.details.fields[0].field).toBe('sharedTutoringRequestIds')

    const foreign = await call('createHelpRequest', 'POST', createPath, {
      body: { ...validBody, sharedTutoringRequestIds: ['00000000-0000-4000-8000-000000000888'] },
    })
    expect(foreign.status).toBe(422)
  })

  it('合法创建返回 201 摘要形状并出现在列表', async () => {
    const created = await call('createHelpRequest', 'POST', createPath, {
      body: { ...validBody, issueTags: ['box_model'], workspaceRevision: 2, sharedTutoringRequestIds: [P2_IDS.seededRequest] },
    })
    expect(created.status).toBe(201)
    expect(created.body.data.status).toBe('open')
    expect(created.body.data.sharedSnapshot).toBeUndefined()

    const list = await call('listHelpRequests', 'GET', listPath)
    expect(list.body.data.total).toBe(3)
    const openOnly = await call('listHelpRequests', 'GET', `${listPath}?status=open`)
    expect(openOnly.body.data.total).toBe(2)
  })
})

describe('P2-A mock：求助详情', () => {
  it('种子已回复求助包含回复、共享快照与 AI 片段正文', async () => {
    await loginAs('student.demo')
    const detail = await call('getHelpRequest', 'GET', `/api/v1/me/help-requests/${P2_IDS.seededHelpAnswered}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.status).toBe('answered')
    expect(detail.body.data.replies).toHaveLength(1)
    expect(detail.body.data.replies[0].teacher.displayName).toBe('演示教师')
    expect(detail.body.data.sharedSnapshot.files.map((file: any) => file.path)).toContain('script.js')
    expect(detail.body.data.sharedTutoringResults).toHaveLength(1)
    expect(detail.body.data.sharedTutoringResults[0].content).toContain('观察')
  })

  it('他人或不存在的求助返回 404', async () => {
    await loginAs('student.demo')
    expect((await call('getHelpRequest', 'GET', '/api/v1/me/help-requests/00000000-0000-4000-8000-000000009999')).status).toBe(404)
  })
})
