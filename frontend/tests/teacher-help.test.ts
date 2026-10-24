import { beforeEach, describe, expect, it } from 'vitest'
import {
  mockTransport, resetMockAssignmentState, resetMockAuthState, resetMockCookies,
  resetMockCourseState, resetMockDashboardState, resetMockFeedbackState, resetMockTutoringState,
} from '../src/mocks/index'
import { P1A_IDS } from '../src/mocks/courses'
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

const teacherListPath = `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/help-requests`
const openDetailPath = `/api/v1/teacher/help-requests/${P2_IDS.seededHelpOpen}/replies`
const openStatusPath = `/api/v1/teacher/help-requests/${P2_IDS.seededHelpOpen}/status`
const detailPath = (id: string) => `/api/v1/teacher/help-requests/${id}`

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

describe('P2-A mock：教师求助权限', () => {
  it('学生不能访问教师求助操作；未登录 401', async () => {
    expect((await call('listTeacherHelpRequests', 'GET', teacherListPath)).status).toBe(401)
    await loginAs('student.demo')
    expect((await call('listTeacherHelpRequests', 'GET', teacherListPath)).status).toBe(403)
    expect((await call('getTeacherHelpRequest', 'GET', detailPath(P2_IDS.seededHelpOpen))).status).toBe(403)
  })

  it('教师写操作缺 CSRF 返回 403', async () => {
    await loginAs('teacher.demo')
    const result = await call('replyToHelpRequest', 'POST', openDetailPath, { body: { content: '回复' }, token: null })
    expect(result.status).toBe(403)
    expect(result.body.error.code).toBe('CSRF_INVALID')
  })
})

describe('P2-A mock：教师列表与详情', () => {
  beforeEach(async () => { await loginAs('teacher.demo') })

  it('列表按班过滤并携带学生身份；status 筛选生效', async () => {
    const list = await call('listTeacherHelpRequests', 'GET', teacherListPath)
    expect(list.status).toBe(200)
    expect(list.body.data.total).toBe(2)
    expect(list.body.data.items[0].student.username).toBe('student.demo')
    const openOnly = await call('listTeacherHelpRequests', 'GET', `${teacherListPath}?status=open`)
    expect(openOnly.body.data.total).toBe(1)
    expect(openOnly.body.data.items[0].id).toBe(P2_IDS.seededHelpOpen)
  })

  it('详情包含学生身份、共享材料与回复；不存在返回 404', async () => {
    const detail = await call('getTeacherHelpRequest', 'GET', detailPath(P2_IDS.seededHelpAnswered))
    expect(detail.status).toBe(200)
    expect(detail.body.data.student.displayName).toBe('演示学生')
    expect(detail.body.data.sharedSnapshot.files.length).toBeGreaterThan(0)
    expect(detail.body.data.replies).toHaveLength(1)
    expect((await call('getTeacherHelpRequest', 'GET', detailPath('00000000-0000-4000-8000-000000009999'))).status).toBe(404)
  })
})

describe('P2-A mock：回复与关闭状态机', () => {
  beforeEach(async () => { await loginAs('teacher.demo') })

  it('回复待处理求助返回 201，状态转 answered，并向学生生成 help_reply 消息', async () => {
    const reply = await call('replyToHelpRequest', 'POST', openDetailPath, {
      body: { content: '试试给导航项加 min-width: 0。' },
    })
    expect(reply.status).toBe(201)
    expect(reply.body.data.status).toBe('answered')

    const detail = await call('getTeacherHelpRequest', 'GET', detailPath(P2_IDS.seededHelpOpen))
    expect(detail.body.data.status).toBe('answered')
    expect(detail.body.data.replies).toHaveLength(1)

    resetMockAuthState(); resetMockCookies(); csrf = ''
    await loginAs('student.demo')
    const messages = await call('listMessages', 'GET', '/api/v1/me/messages')
    const helpReply = messages.body.data.items.find((item: any) => item.type === 'help_reply')
    expect(helpReply.title).toContain('弹性对齐的期望行为')
    expect(helpReply.target).toEqual({ type: 'help_request', id: P2_IDS.seededHelpOpen, offeringId: P1A_IDS.offeringWeb })
    expect(helpReply.readAt).toBeNull()
  })

  it('关闭后回复返回 409 HELP_REQUEST_CLOSED；重复关闭幂等返回 200 原状态', async () => {
    const closed = await call('closeHelpRequest', 'PUT', openStatusPath, { body: { status: 'closed' } })
    expect(closed.status).toBe(200)
    expect(closed.body.data.status).toBe('closed')

    const again = await call('closeHelpRequest', 'PUT', openStatusPath, { body: { status: 'closed' } })
    expect(again.status).toBe(200)
    expect(again.body.data.updatedAt).toBe(closed.body.data.updatedAt)

    const rejected = await call('replyToHelpRequest', 'POST', openDetailPath, { body: { content: '再回复' } })
    expect(rejected.status).toBe(409)
    expect(rejected.body.error.code).toBe('HELP_REQUEST_CLOSED')
  })

  it('空回复与非法 status 返回 422', async () => {
    expect((await call('replyToHelpRequest', 'POST', openDetailPath, { body: { content: ' ' } })).status).toBe(422)
    expect((await call('closeHelpRequest', 'PUT', openStatusPath, { body: { status: 'open' } })).status).toBe(422)
  })
})
