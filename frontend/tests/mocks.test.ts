import { beforeEach, describe, expect, it } from 'vitest'
import { mockTransport, resetMockAuthState, resetMockCookies } from '../src/mocks/index'
import { MockNotImplementedError } from '../src/mocks/types'
import { MOCK_TERM } from '../src/mocks/auth'
import { P1A_IDS } from '../src/mocks/courses'
import type { TransportRequest } from '../src/api/transport'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

interface MockCall {
  status: number
  body: Record<string, unknown>
  headers: Record<string, string | string[]>
}

async function call(
  request: Partial<TransportRequest> & { operationId: string },
): Promise<MockCall> {
  const response = await mockTransport.request({
    operationId: request.operationId,
    method: request.method ?? 'GET',
    path: request.path ?? '/api/v1/unknown',
    headers: request.headers ?? {},
    body: request.body,
  })
  return {
    status: response.status,
    body: JSON.parse(response.bodyText) as Record<string, unknown>,
    headers: response.headers,
  }
}

interface MockEnvelope {
  data: Record<string, unknown>
  requestId: string
}

function okBody(callResult: MockCall): MockEnvelope {
  return callResult.body as unknown as MockEnvelope
}

interface MockFailure {
  error: { code: string; message: string; details: Record<string, unknown> }
  requestId: string
}

function failBody(callResult: MockCall): MockFailure {
  return callResult.body as unknown as MockFailure
}

/** 走完整匿名登录链：取 CSRF → 携令牌登录。 */
async function loginAsMock(username: string, password: string): Promise<MockCall> {
  const csrf = await call({ operationId: 'getCsrfToken' })
  const data = okBody(csrf).data
  const token = data['csrfToken']
  if (typeof token !== 'string') throw new Error('mock 未返回令牌')
  return call({
    operationId: 'login',
    method: 'POST',
    headers: { 'X-CSRF-Token': token },
    body: JSON.stringify({ username, password }),
  })
}

beforeEach(() => {
  resetMockAuthState()
  resetMockCookies()
})

describe('mock 层信封与 Cookie（同一契约）', () => {
  it('匿名 getCsrfToken：200 信封返回令牌，设置 lp_pre_auth', async () => {
    const result = await call({ operationId: 'getCsrfToken' })
    expect(result.status).toBe(200)
    const envelope = okBody(result)
    expect(typeof envelope.data['csrfToken']).toBe('string')
    expect(envelope.requestId).toMatch(REQUEST_ID_PATTERN)
    const setCookie = result.headers['set-cookie']
    expect(Array.isArray(setCookie)).toBe(true)
    expect(String(setCookie)).toContain('lp_pre_auth=')
  })

  it('登录先校验 CSRF：令牌缺失或错误返回 403 CSRF_INVALID', async () => {
    const missing = await call({
      operationId: 'login',
      method: 'POST',
      headers: {},
      body: JSON.stringify({ username: 'student.demo', password: 'mock-demo-pass' }),
    })
    expect(missing.status).toBe(403)
    expect(failBody(missing).error.code).toBe('CSRF_INVALID')

    const stale = await call({
      operationId: 'login',
      method: 'POST',
      headers: { 'X-CSRF-Token': 'wrong-token' },
      body: JSON.stringify({ username: 'student.demo', password: 'mock-demo-pass' }),
    })
    expect(stale.status).toBe(403)
    expect(failBody(stale).error.code).toBe('CSRF_INVALID')
  })

  it('登录输入缺失：422 VALIDATION_ERROR 带字段错误', async () => {
    const result = await loginAsMock('student.demo', '')
    expect(result.status).toBe(422)
    const failure = failBody(result)
    expect(failure.error.code).toBe('VALIDATION_ERROR')
    const fields = failure.error.details['fields']
    expect(Array.isArray(fields)).toBe(true)
  })

  it('登录凭据错误：401 INVALID_CREDENTIALS，details 为空对象', async () => {
    const result = await loginAsMock('student.demo', 'wrong-password')
    expect(result.status).toBe(401)
    const failure = failBody(result)
    expect(failure.error.code).toBe('INVALID_CREDENTIALS')
    expect(failure.error.details).toEqual({})
  })

  it('登录成功：返回 LoginDTO 结构，轮换 lp_session 并清除 lp_pre_auth', async () => {
    const result = await loginAsMock('student.demo', 'mock-demo-pass')
    expect(result.status).toBe(200)
    const data = okBody(result).data
    const user = data['user'] as Record<string, unknown>
    expect(user['username']).toBe('student.demo')
    expect(user['id']).toMatch(UUID_PATTERN)
    expect(user['roles']).toEqual(['student'])
    expect(typeof data['csrfToken']).toBe('string')
    const setCookie = String(result.headers['set-cookie'])
    expect(setCookie).toContain('lp_session=')
    expect(setCookie).toContain('lp_pre_auth=')
  })

  it('登录后 getMe 返回 UserDTO；退出后返回 401', async () => {
    await loginAsMock('student.demo', 'mock-demo-pass')
    const me = await call({ operationId: 'getMe' })
    expect(me.status).toBe(200)
    expect((okBody(me).data['username'] as string)).toBe('student.demo')

    // 退出：需要会话 CSRF
    const csrf = await call({ operationId: 'getCsrfToken' })
    const token = okBody(csrf).data['csrfToken'] as string
    const logout = await call({
      operationId: 'logout',
      method: 'POST',
      headers: { 'X-CSRF-Token': token },
      body: '{}',
    })
    expect(logout.status).toBe(200)
    expect(okBody(logout).data['loggedOut']).toBe(true)
    expect(String(logout.headers['set-cookie'])).toContain('lp_session=')

    const after = await call({ operationId: 'getMe' })
    expect(after.status).toBe(401)
    expect(failBody(after).error.code).toBe('UNAUTHENTICATED')
  })

  it('getConfig 返回契约要求的学期配置，特色功能保持关闭', async () => {
    await loginAsMock('student.demo', 'mock-demo-pass')
    const result = await call({ operationId: 'getConfig' })
    expect(result.status).toBe(200)
    const data = okBody(result).data
    expect(data['apiVersion']).toBe('v1')
    expect(data['timezone']).toBe('Asia/Shanghai')
    expect(data['currentTermId']).toBe(MOCK_TERM.id)
    expect(data['terms']).toEqual([MOCK_TERM])
    expect(data['serverTime']).toMatch(TIMESTAMP_PATTERN)
    const features = data['features'] as Record<string, unknown>
    expect(features['aiTutoring']).toBe(false)
    expect(features['learningAnalytics']).toBe(false)
    expect(features['serverChecks']).toBe(false)
  })

  it('无会话访问受保护操作：401 UNAUTHENTICATED', async () => {
    const me = await call({ operationId: 'getMe' })
    expect(me.status).toBe(401)
    expect(failBody(me).error.code).toBe('UNAUTHENTICATED')

    const config = await call({ operationId: 'getConfig' })
    expect(config.status).toBe(401)
    expect(failBody(config).error.code).toBe('UNAUTHENTICATED')
  })

  it('未实现的操作显式失败，不转发真实请求', async () => {
    await expect(
      call({ operationId: 'getDashboard', path: '/api/v1/me/dashboard' }),
    ).rejects.toBeInstanceOf(MockNotImplementedError)
  })

  it('退出携带错误 CSRF：403 CSRF_INVALID，会话保持', async () => {
    await loginAsMock('student.demo', 'mock-demo-pass')
    const logout = await call({
      operationId: 'logout',
      method: 'POST',
      headers: { 'X-CSRF-Token': 'wrong-token' },
      body: '{}',
    })
    expect(logout.status).toBe(403)
    expect(failBody(logout).error.code).toBe('CSRF_INVALID')
    const me = await call({ operationId: 'getMe' })
    expect(me.status).toBe(200)
  })
})
async function loginTeacherAndGetCsrf(): Promise<string> {
  const result = await loginAsMock('teacher.demo', 'mock-demo-pass')
  const token = okBody(result).data['csrfToken']
  if (typeof token !== 'string') throw new Error('教师登录未返回 CSRF 令牌')
  return token
}

describe('P1-A 教学 mock 契约分支', () => {
  it('教师可以创建并发布章节，重复发布返回 200 原结果', async () => {
    const csrfToken = await loginTeacherAndGetCsrf()
    const created = await call({
      operationId: 'createChapter',
      method: 'POST',
      path: `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/chapters`,
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ number: 99, title: 'mock 新章节', summary: 'mock 摘要', isRequired: true }),
    })
    expect(created.status).toBe(201)
    const chapterId = okBody(created).data['id']
    expect(typeof chapterId).toBe('string')

    const publish = await call({
      operationId: 'publishChapter', method: 'POST',
      path: `/api/v1/teacher/chapters/${chapterId}/publish`,
      headers: { 'X-CSRF-Token': csrfToken }, body: '{}',
    })
    const duplicate = await call({
      operationId: 'publishChapter', method: 'POST',
      path: `/api/v1/teacher/chapters/${chapterId}/publish`,
      headers: { 'X-CSRF-Token': csrfToken }, body: '{}',
    })
    expect(publish.status).toBe(200)
    expect(duplicate.status).toBe(200)
    expect(okBody(duplicate).data).toEqual(okBody(publish).data)
  })

  it('教师邀请码创建只在创建响应返回明文，之后可幂等撤销', async () => {
    const csrfToken = await loginTeacherAndGetCsrf()
    const created = await call({
      operationId: 'createInvite', method: 'POST',
      path: `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/invites`,
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ expiresAt: '2099-01-01T00:00:00Z', maxUses: 2 }),
    })
    expect(created.status).toBe(201)
    const createdData = okBody(created).data
    expect(typeof createdData['inviteCode']).toBe('string')
    const inviteId = createdData['id']
    if (typeof inviteId !== 'string') throw new Error('创建邀请码未返回 id')

    const listed = await call({ operationId: 'listInvites', path: `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/invites?page=1&pageSize=20` })
    expect(listed.status).toBe(200)
    const listedItems = okBody(listed).data['items']
    expect(Array.isArray(listedItems)).toBe(true)
    expect(listedItems).not.toContainEqual(expect.objectContaining({ inviteCode: createdData['inviteCode'] }))

    const revoked = await call({
      operationId: 'revokeInvite', method: 'POST',
      path: `/api/v1/teacher/invites/${inviteId}/revoke`,
      headers: { 'X-CSRF-Token': csrfToken }, body: '{}',
    })
    const revokedAgain = await call({
      operationId: 'revokeInvite', method: 'POST',
      path: `/api/v1/teacher/invites/${inviteId}/revoke`,
      headers: { 'X-CSRF-Token': csrfToken }, body: '{}',
    })
    expect(revoked.status).toBe(200)
    expect(revokedAgain.status).toBe(200)
    expect(okBody(revokedAgain).data).toEqual(okBody(revoked).data)
  })

  it('归档成功幂等，待批阅返回 ARCHIVE_PENDING_REVIEWS；归档章节返回 CHAPTER_ARCHIVED', async () => {
    const csrfToken = await loginTeacherAndGetCsrf()
    const first = await call({
      operationId: 'archiveOffering', method: 'POST',
      path: `/api/v1/teacher/offerings/${P1A_IDS.offeringEmpty}/archive`,
      headers: { 'X-CSRF-Token': csrfToken }, body: '{}',
    })
    const second = await call({
      operationId: 'archiveOffering', method: 'POST',
      path: `/api/v1/teacher/offerings/${P1A_IDS.offeringEmpty}/archive`,
      headers: { 'X-CSRF-Token': csrfToken }, body: '{}',
    })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(okBody(second).data).toEqual(okBody(first).data)

    const pending = await call({
      operationId: 'archiveOffering', method: 'POST',
      path: `/api/v1/teacher/offerings/${P1A_IDS.offeringPendingArchive}/archive`,
      headers: { 'X-CSRF-Token': csrfToken }, body: '{}',
    })
    expect(pending.status).toBe(409)
    expect(failBody(pending).error.code).toBe('ARCHIVE_PENDING_REVIEWS')

    const archivedChapter = await call({
      operationId: 'publishChapter', method: 'POST',
      path: `/api/v1/teacher/chapters/${P1A_IDS.chapterArchived}/publish`,
      headers: { 'X-CSRF-Token': csrfToken }, body: '{}',
    })
    expect(archivedChapter.status).toBe(409)
    expect(failBody(archivedChapter).error.code).toBe('CHAPTER_ARCHIVED')

    resetMockAuthState()
    resetMockCookies()
    const studentLogin = await loginAsMock('student.demo', 'mock-demo-pass')
    const studentToken = okBody(studentLogin).data['csrfToken']
    if (typeof studentToken !== 'string') throw new Error('学生登录未返回 CSRF 令牌')
    const archivedProgress = await call({
      operationId: 'updateChapterProgress', method: 'PUT',
      path: '/api/v1/chapters/' + P1A_IDS.chapterArchived + '/progress',
      headers: { 'X-CSRF-Token': studentToken }, body: JSON.stringify({ status: 'completed' }),
    })
    expect(archivedProgress.status).toBe(409)
    expect(failBody(archivedProgress).error.code).toBe('CHAPTER_ARCHIVED')
  })

  it('createOffering 的 FORBIDDEN 与 OFFERING_ARCHIVED 分支以及分页边界可到达', async () => {
    const csrfToken = await loginTeacherAndGetCsrf()
    const body = { title: '新教学班', groupName: '演示班', termId: MOCK_TERM.id, progressUnit: 'chapter' }
    const forbidden = await call({
      operationId: 'createOffering', method: 'POST', path: '/api/v1/teacher/offerings',
      headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ ...body, courseId: P1A_IDS.baseForbidden }),
    })
    const conflict = await call({
      operationId: 'createOffering', method: 'POST', path: '/api/v1/teacher/offerings',
      headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ ...body, courseId: P1A_IDS.baseConflict }),
    })
    expect(forbidden.status).toBe(403)
    expect(failBody(forbidden).error.code).toBe('FORBIDDEN')
    expect(conflict.status).toBe(409)
    expect(failBody(conflict).error.code).toBe('OFFERING_ARCHIVED')

    const last = await call({ operationId: 'listInvites', path: `/api/v1/teacher/offerings/${P1A_IDS.offeringDatabase}/invites?page=99&pageSize=1` })
    expect(last.status).toBe(200)
    expect(okBody(last).data['items']).toEqual([])
    expect(okBody(last).data['total']).toBe(4)
    const empty = await call({ operationId: 'listInvites', path: `/api/v1/teacher/offerings/${P1A_IDS.offeringPendingArchive}/invites?page=1&pageSize=20` })
    expect(empty.status).toBe(200)
    expect(okBody(empty).data['items']).toEqual([])
    expect(okBody(empty).data['total']).toBe(0)
  })
})
