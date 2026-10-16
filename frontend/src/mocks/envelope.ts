import { mockSession, requireMockSession, validateMockCsrf } from './auth'
import { randomUUID } from './random'
import type { MockRequestContext, MockResult } from './types'

export const MOCK_STUDENT = { id: '00000000-0000-4000-8000-000000000001', username: 'student.demo', displayName: '演示学生' } as const
export const MOCK_TEACHER = { id: '00000000-0000-4000-8000-000000000002', displayName: '演示教师' } as const

const requestId =(context: MockRequestContext) => context.headers['X-Request-ID'] || randomUUID()

export const ok = (context: MockRequestContext, data: unknown, status = 200): MockResult => ({ status, bodyJson: { data: structuredClone(data), requestId: requestId(context) } })
export const fail = (context: MockRequestContext, status: number, code: string, message: string): MockResult => ({ status, bodyJson: { error: { code, message, details: {} }, requestId: requestId(context) } })
export const invalid = (context: MockRequestContext, message = '输入不符合要求。', field = 'body'): MockResult => ({ status: 422, bodyJson: { error: { code: 'VALIDATION_ERROR', message, details: { fields: [{ field, message }] } }, requestId: requestId(context) } })
export const missing = (context: MockRequestContext) => fail(context, 404, 'NOT_FOUND', '对象不存在或不可访问。')

const url = (context: MockRequestContext) => new URL(context.path, 'http://mock.local')
export const segment = (context: MockRequestContext, index: number) => url(context).pathname.split('/').filter(Boolean)[index] ?? ''
export const searchParams = (context: MockRequestContext) => url(context).searchParams

export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export const isEmptyObject = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0

/** 会话、写请求 CSRF 与角色检查；通过时返回 null。 */
export function guard(context: MockRequestContext, roles: readonly ('student' | 'teacher')[]): MockResult | null {
  const unavailable = requireMockSession(context)
  if (unavailable !== null) return unavailable
  const session = mockSession()
  if (session === null) return fail(context, 401, 'UNAUTHENTICATED', '会话不存在或已过期。')
  if (context.method !== 'GET') {
    const csrfFailure = validateMockCsrf(context)
    if (csrfFailure !== null) return csrfFailure
  }
  if (!roles.some(role => session.account.roles.includes(role))) return fail(context, 403, 'FORBIDDEN', '当前角色不能执行此操作。')
  return null
}

export interface PageWindow { page: number; pageSize: number }

/** 解析 page/pageSize；不合法返回 null，由调用方给出 422。 */
export function pageWindow(params: URLSearchParams): PageWindow | null {
  const page = params.get('page') === null ? 1 : Number(params.get('page'))
  const pageSize = params.get('pageSize') === null ? 20 : Number(params.get('pageSize'))
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null
  return { page, pageSize }
}

export function paginate<T>(items: readonly T[], window: PageWindow): { items: T[]; page: number; pageSize: number; total: number } {
  const start = (window.page - 1) * window.pageSize
  return { items: items.slice(start, start + window.pageSize), page: window.page, pageSize: window.pageSize, total: items.length }
}
