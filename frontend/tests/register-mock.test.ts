import { beforeEach, describe, expect, it } from 'vitest'
import { mockTransport, resetMockAuthState, resetMockCookies, resetMockAccounts, resetSharedMembers } from '../src/mocks/index'
import type { TransportRequest } from '../src/api/transport'

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

function okBody(callResult: MockCall): { data: Record<string, unknown>; requestId: string } {
  return callResult.body as unknown as { data: Record<string, unknown>; requestId: string }
}

function failBody(callResult: MockCall): { error: { code: string; message: string }; requestId: string } {
  return callResult.body as unknown as { error: { code: string; message: string }; requestId: string }
}

async function getCsrfToken(): Promise<string> {
  const csrf = await call({ operationId: 'getCsrfToken' })
  const data = okBody(csrf).data
  const token = data['csrfToken']
  if (typeof token !== 'string') throw new Error('mock 未返回令牌')
  return token
}

beforeEach(() => {
  resetMockAuthState()
  resetMockCookies()
  resetMockAccounts()
  resetSharedMembers()
})

describe('注册 mock 处理器', () => {
  describe('个人模式注册', () => {
    it('成功注册并自动登录', async () => {
      const csrfToken = await getCsrfToken()
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'newuser',
          password: 'Password123',
          displayName: '新用户',
          mode: 'personal',
        }),
      })
      expect(result.status).toBe(201)
      const data = okBody(result).data
      expect(data['user']).toBeDefined()
      expect(data['csrfToken']).toBeDefined()
      const user = data['user'] as Record<string, unknown>
      expect(user['username']).toBe('newuser')
      expect(user['displayName']).toBe('新用户')
      expect(user['roles']).toEqual(['student'])
    })

    it('注册后可通过 getMe 获取用户信息', async () => {
      const csrfToken = await getCsrfToken()
      await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'testuser',
          password: 'TestPass123',
          displayName: '测试用户',
          mode: 'personal',
        }),
      })
      const meResult = await call({ operationId: 'getMe' })
      expect(meResult.status).toBe(200)
      const meData = okBody(meResult).data
      expect(meData['username']).toBe('testuser')
    })
  })

  describe('学校模式 - 学生注册', () => {
    it('使用有效邀请码成功注册', async () => {
      const csrfToken = await getCsrfToken()
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'student1',
          password: 'Student123',
          displayName: '学生一',
          mode: 'school',
          role: 'student',
          inviteCode: 'P1A-DB-DEMO-2026',
        }),
      })
      expect(result.status).toBe(201)
      const user = okBody(result).data['user'] as Record<string, unknown>
      expect(user['roles']).toEqual(['student'])
    })

    it('使用无效邀请码返回 400', async () => {
      const csrfToken = await getCsrfToken()
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'student2',
          password: 'Student123',
          displayName: '学生二',
          mode: 'school',
          role: 'student',
          inviteCode: 'INVALID-CODE',
        }),
      })
      expect(result.status).toBe(400)
      expect(failBody(result).error.code).toBe('INVALID_INVITE_CODE')
    })

    it('缺少邀请码返回 422', async () => {
      const csrfToken = await getCsrfToken()
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'student3',
          password: 'Student123',
          displayName: '学生三',
          mode: 'school',
          role: 'student',
        }),
      })
      expect(result.status).toBe(422)
      expect(failBody(result).error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('学校模式 - 教师注册', () => {
    it('成功注册并可选择创建班级', async () => {
      const csrfToken = await getCsrfToken()
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'teacher1',
          password: 'Teacher123',
          displayName: '教师一',
          mode: 'school',
          role: 'teacher',
          createClass: true,
        }),
      })
      expect(result.status).toBe(201)
      const user = okBody(result).data['user'] as Record<string, unknown>
      expect(user['roles']).toEqual(['teacher'])
    })
  })

  describe('错误场景', () => {
    it('用户名冲突返回 400', async () => {
      const csrfToken = await getCsrfToken()
      // 先注册一个用户
      await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'duplicate',
          password: 'Password123',
          displayName: '重复用户',
          mode: 'personal',
        }),
      })
      // 重置会话状态（清除 session，但保留 ACCOUNTS）
      resetMockAuthState()
      // 获取新的匿名 CSRF 令牌
      const newToken = await getCsrfToken()
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': newToken },
        body: JSON.stringify({
          username: 'duplicate',
          password: 'Password456',
          displayName: '另一个用户',
          mode: 'personal',
        }),
      })
      expect(result.status).toBe(400)
      expect(failBody(result).error.code).toBe('USERNAME_TAKEN')
    })

    it('CSRF 校验失败返回 403', async () => {
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': 'invalid-token' },
        body: JSON.stringify({
          username: 'newuser',
          password: 'Password123',
          displayName: '新用户',
          mode: 'personal',
        }),
      })
      expect(result.status).toBe(403)
      expect(failBody(result).error.code).toBe('CSRF_INVALID')
    })

    it('用户名格式错误返回 422', async () => {
      const csrfToken = await getCsrfToken()
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'ab', // 太短
          password: 'Password123',
          displayName: '用户',
          mode: 'personal',
        }),
      })
      expect(result.status).toBe(422)
      expect(failBody(result).error.code).toBe('VALIDATION_ERROR')
    })

    it('密码强度不足返回 422', async () => {
      const csrfToken = await getCsrfToken()
      const result = await call({
        operationId: 'register',
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          username: 'newuser',
          password: 'password', // 缺少大写和数字
          displayName: '用户',
          mode: 'personal',
        }),
      })
      expect(result.status).toBe(422)
      expect(failBody(result).error.code).toBe('VALIDATION_ERROR')
    })
  })
})
