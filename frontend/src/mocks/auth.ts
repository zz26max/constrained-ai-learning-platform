import { randomUUID } from './random'
import type { MockHandler, MockRequestContext } from './types'

/**
 * 首批五个认证操作的 mock 处理器（虚构材料，通过同一契约类型校验）。
 * 虚构账号沿用契约示例：student.demo / teacher.demo / admin.demo；
 * 口令统一 mock-demo-pass，仅存在于 mock 层。
 */
const MOCK_PASSWORD = 'mock-demo-pass'

interface MockAccount {
  readonly id: string
  readonly username: string
  readonly displayName: string
  readonly roles: readonly string[]
}

const ACCOUNTS: readonly MockAccount[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'student.demo',
    displayName: '演示学生',
    roles: ['student'],
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    username: 'teacher.demo',
    displayName: '演示教师',
    roles: ['teacher'],
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    username: 'admin.demo',
    displayName: '演示管理员',
    roles: ['admin'],
  },
]

interface MockSession {
  readonly account: MockAccount
  readonly csrfToken: string
}

interface MockAuthState {
  preLoginToken: string | null
  session: MockSession | null
  requestCounter: number
}

const state: MockAuthState = {
  preLoginToken: null,
  session: null,
  requestCounter: 0,
}

/** 测试隔离：每个用例重置会话与 Cookie 存量。 */
export function resetMockAuthState(): void {
  state.preLoginToken = null
  state.session = null
  state.requestCounter = 0
}

function nextRequestId(): string {
  state.requestCounter += 1
  return `mock-req-${state.requestCounter}`
}

function ok(data: unknown): { status: 200; bodyJson: unknown } {
  return { status: 200, bodyJson: { data, requestId: nextRequestId() } }
}

function fail(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): { status: number; bodyJson: unknown } {
  return {
    status,
    bodyJson: { error: { code, message, details }, requestId: nextRequestId() },
  }
}

function userDto(account: MockAccount): Record<string, unknown> {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    roles: [...account.roles],
  }
}

function isBody(context: MockRequestContext): Record<string, unknown> | null {
  if (context.bodyJson === null || typeof context.bodyJson !== 'object') return null
  if (Array.isArray(context.bodyJson)) return null
  return context.bodyJson as Record<string, unknown>
}

/** getCsrfToken：匿名时签发预登录令牌并设置 lp_pre_auth；已登录返回会话绑定令牌。 */
export const getCsrfTokenHandler: MockHandler = (context) => {
  if (state.session !== null) {
    return ok({ csrfToken: state.session.csrfToken })
  }
  const token = `pre-csrf-${randomUUID()}`
  state.preLoginToken = token
  return { ...ok({ csrfToken: token }), setCookies: [`lp_pre_auth=${token}; Path=/; HttpOnly; SameSite=Lax`] }
}

/** login：先校验 CSRF（业务写入前拒绝），再校验输入与虚构凭据；成功轮换会话并清除预登录 Cookie。 */
export const loginHandler: MockHandler = (context) => {
  const headerToken = context.headers['X-CSRF-Token'] ?? ''
  if (state.preLoginToken === null || headerToken !== state.preLoginToken) {
    return fail(403, 'CSRF_INVALID', '登录令牌无效，请刷新后重试。')
  }
  const body = isBody(context)
  const username = body === null ? undefined : body['username']
  const password = body === null ? undefined : body['password']
  const fields: Record<string, string>[] = []
  if (typeof username !== 'string' || username.length < 1) {
    fields.push({ field: 'username', message: '用户名不能为空。' })
  }
  if (typeof password !== 'string' || password.length < 1) {
    fields.push({ field: 'password', message: '密码不能为空。' })
  }
  if (fields.length > 0) {
    return fail(422, 'VALIDATION_ERROR', '字段校验失败。', { fields })
  }
  const account = ACCOUNTS.find((item) => item.username === username)
  if (account === undefined || password !== MOCK_PASSWORD) {
    return fail(401, 'INVALID_CREDENTIALS', '用户名或密码错误。')
  }
  const csrfToken = `session-csrf-${randomUUID()}`
  state.session = { account, csrfToken }
  state.preLoginToken = null
  return {
    ...ok({ user: userDto(account), csrfToken }),
    setCookies: [
      `lp_session=${randomUUID()}; Path=/; HttpOnly; SameSite=Lax`,
      'lp_pre_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    ],
  }
}

/** logout：要求会话与 CSRF；成功清除会话 Cookie。 */
export const logoutHandler: MockHandler = (context) => {
  if (state.session === null || context.cookies['lp_session'] === undefined) {
    return fail(401, 'UNAUTHENTICATED', '会话不存在或已过期。')
  }
  const headerToken = context.headers['X-CSRF-Token'] ?? ''
  if (headerToken !== state.session.csrfToken) {
    return fail(403, 'CSRF_INVALID', '退出令牌无效，请重试。')
  }
  state.session = null
  return {
    ...ok({ loggedOut: true }),
    setCookies: ['lp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'],
  }
}

/** getMe：会话恢复身份，未知用户名按不存在处理。 */
export const getMeHandler: MockHandler = (context) => {
  if (state.session === null || context.cookies['lp_session'] === undefined) {
    return fail(401, 'UNAUTHENTICATED', '会话不存在或已过期。')
  }
  return ok(userDto(state.session.account))
}

/** getConfig：P0/P1 阶段 features 全部关闭，currentTermId 为空（与契约 ConfigDTO 一致）。 */
export const getConfigHandler: MockHandler = (context) => {
  if (state.session === null || context.cookies['lp_session'] === undefined) {
    return fail(401, 'UNAUTHENTICATED', '会话不存在或已过期。')
  }
  return ok({
    apiVersion: 'v1',
    serverTime: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    currentTermId: null,
    terms: [],
    features: { aiTutoring: false, learningAnalytics: false, serverChecks: false },
  })
}

export const authHandlers: Record<string, MockHandler> = {
  getCsrfToken: getCsrfTokenHandler,
  login: loginHandler,
  logout: logoutHandler,
  getMe: getMeHandler,
  getConfig: getConfigHandler,
}

export const MOCK_ACCOUNT_HINT = 'student.demo / teacher.demo / admin.demo，口令 mock-demo-pass'
