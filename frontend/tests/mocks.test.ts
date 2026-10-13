import { beforeEach, describe, expect, it } from 'vitest'
import { mockTransport, resetMockAuthState, resetMockCookies } from '../src/mocks/index'
import { MockNotImplementedError } from '../src/mocks/types'
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

  it('getConfig 返回契约要求的 ConfigDTO 形状（P0 全部功能关闭）', async () => {
    await loginAsMock('student.demo', 'mock-demo-pass')
    const result = await call({ operationId: 'getConfig' })
    expect(result.status).toBe(200)
    const data = okBody(result).data
    expect(data['apiVersion']).toBe('v1')
    expect(data['timezone']).toBe('Asia/Shanghai')
    expect(data['currentTermId']).toBeNull()
    expect(data['terms']).toEqual([])
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
