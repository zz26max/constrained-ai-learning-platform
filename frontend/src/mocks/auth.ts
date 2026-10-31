import { randomUUID } from './random'
import type { MockHandler, MockRequestContext, MockResult } from './types'
import type { components } from '../api/generated/schema'
import { sharedMembers } from './shared-state'
import { P1A_IDS, P1A_INVITE_CODES } from './constants'

/**
 * 首批五个认证操作的 mock 处理器（虚构材料，通过同一契约类型校验）。
 * 虚构账号沿用契约示例：student.demo / teacher.demo / admin.demo；
 * 口令统一 mock-demo-pass，仅存在于 mock 层。
 */
const MOCK_PASSWORD = 'mock-demo-pass'

type MockAccount = components['schemas']['UserDTO']

export const MOCK_TERM: components['schemas']['TermDTO'] = {
  id: '00000000-0000-4000-8000-000000000011',
  label: '2026 秋季学期',
  startsAt: '2026-09-01T00:00:00Z',
  endsAt: '2027-01-31T23:59:59Z',
}

const INITIAL_ACCOUNTS: MockAccount[] = [
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

const ACCOUNTS: MockAccount[] = [...INITIAL_ACCOUNTS]

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

/** 测试隔离：重置账号列表到初始状态。 */
export function resetMockAccounts(): void {
  ACCOUNTS.length = 0
  ACCOUNTS.push(...INITIAL_ACCOUNTS)
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

function userDto(account: MockAccount): components['schemas']['UserDTO'] {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    roles: [...account.roles],
  }
}

/** Shared mock modules use this identity; switching accounts does not create a second session. */
export function mockSession(): Readonly<MockSession> | null {
  return state.session
}

export function requireMockSession(context: MockRequestContext): MockResult | null {
  return state.session === null || context.cookies['lp_session'] === undefined
    ? fail(401, 'UNAUTHENTICATED', '会话不存在或已过期。')
    : null
}

/** Reject a write before touching course state. Mock does not claim to verify browser Origin. */
export function validateMockCsrf(context: MockRequestContext): MockResult | null {
  const unavailable = requireMockSession(context)
  if (unavailable !== null) return unavailable
  return state.session !== null && context.headers['X-CSRF-Token'] === state.session.csrfToken
    ? null
    : fail(403, 'CSRF_INVALID', '登录令牌无效，请重新操作。')
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

/** register：双模式注册。personal 模式统一学生身份并自动关联个人课程；school 模式需选择角色，学生通过邀请码加入班级，教师可创建班级。 */
export const registerHandler: MockHandler = (context) => {
  const headerToken = context.headers['X-CSRF-Token'] ?? ''
  if (state.preLoginToken === null || headerToken !== state.preLoginToken) {
    return fail(403, 'CSRF_INVALID', '注册令牌无效，请刷新后重试。')
  }
  const body = isBody(context)
  if (body === null) {
    return fail(415, 'UNSUPPORTED_MEDIA_TYPE', '请求体必须为 JSON。')
  }
  
  const username = body['username']
  const password = body['password']
  const displayName = body['displayName']
  const mode = body['mode']
  const role = body['role']
  const inviteCode = body['inviteCode']
  const createClass = body['createClass']
  
  const fields: Record<string, string>[] = []
  
  // 校验 username
  if (typeof username !== 'string' || username.length < 3 || username.length > 32 || !/^[a-z0-9._-]+$/i.test(username)) {
    fields.push({ field: 'username', message: '用户名须为 3-32 位字母、数字、点、下划线或连字符。' })
  }
  
  // 校验 password
  if (typeof password !== 'string' || password.length < 8 || password.length > 64 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    fields.push({ field: 'password', message: '密码须为 8-64 位，至少含大写、小写字母与数字各一个。' })
  }
  
  // 校验 displayName
  if (typeof displayName !== 'string' || displayName.length < 1 || displayName.length > 50) {
    fields.push({ field: 'displayName', message: '显示名称须为 1-50 字符。' })
  }
  
  // 校验 mode
  if (mode !== 'personal' && mode !== 'school') {
    fields.push({ field: 'mode', message: '模式须为 personal 或 school。' })
  }
  
  // school 模式校验 role
  if (mode === 'school' && role !== 'student' && role !== 'teacher') {
    fields.push({ field: 'role', message: '学校模式须选择角色（student 或 teacher）。' })
  }
  
  // school+student 模式校验 inviteCode
  if (mode === 'school' && role === 'student' && (typeof inviteCode !== 'string' || inviteCode.length < 1)) {
    fields.push({ field: 'inviteCode', message: '学生模式须填写邀请码。' })
  }
  
  if (fields.length > 0) {
    return fail(422, 'VALIDATION_ERROR', '字段校验失败。', { fields })
  }
  
  // 校验分支已保证 username/displayName 为字符串；此处收窄，避免 unknown 扩散到账号模型
  const accountUsername = username as string
  const accountDisplayName = displayName as string

  // 用户名唯一性检查
  if (ACCOUNTS.some(a => a.username === accountUsername.toLowerCase())) {
    return fail(400, 'USERNAME_TAKEN', '该用户名已被占用。')
  }
  
  // 确定角色
  const userRoles: Array<'student' | 'teacher'> = mode === 'personal' ? ['student'] : [role as 'student' | 'teacher']
  
  // 创建新账号
  const newAccount: MockAccount = {
    id: randomUUID(),
    username: accountUsername.toLowerCase(),
    displayName: accountDisplayName,
    roles: userRoles,
  }
  ACCOUNTS.push(newAccount)
  
  // 关联课程
  if (mode === 'personal') {
    // 个人模式：自动关联个人课程
    const memberList = sharedMembers.get(P1A_IDS.offeringPersonal)
    if (memberList) {
      memberList.push({
        userId: newAccount.id,
        displayName: newAccount.displayName,
        username: newAccount.username,
        role: 'student',
        joinedAt: new Date().toISOString(),
      })
    }
  } else if (mode === 'school' && role === 'student') {
    // 学校+学生模式：通过邀请码加入班级
    const validInvite = (Object.values(P1A_INVITE_CODES) as string[]).includes(inviteCode as string)
    if (!validInvite) {
      // 回滚账号创建
      ACCOUNTS.pop()
      return fail(400, 'INVALID_INVITE_CODE', '邀请码无效，请向教师确认。')
    }
    // 找到邀请码对应的 offering 并加入
    // 简化处理：所有有效邀请码都对应 offeringDatabase
    const offeringId = P1A_IDS.offeringDatabase
    const memberList = sharedMembers.get(offeringId)
    if (memberList) {
      memberList.push({
        userId: newAccount.id,
        displayName: newAccount.displayName,
        username: newAccount.username,
        role: 'student',
        joinedAt: new Date().toISOString(),
      })
    }
  } else if (mode === 'school' && role === 'teacher' && createClass === true) {
    // 学校+教师模式：创建班级（简化处理，实际应该调用 courses.ts 的创建逻辑）
    // 这里不实际创建，只是在响应中标记
  }
  
  // 建立会话（自动登录）
  const csrfToken = `session-csrf-${randomUUID()}`
  state.session = { account: newAccount, csrfToken }
  state.preLoginToken = null
  
  return {
    status: 201,
    bodyJson: {
      data: { user: userDto(newAccount), csrfToken },
      requestId: nextRequestId(),
    },
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

/** getConfig: fictional term supports P1-A filtering; later-stage features remain disabled. */
export const getConfigHandler: MockHandler = (context) => {
  if (state.session === null || context.cookies['lp_session'] === undefined) {
    return fail(401, 'UNAUTHENTICATED', '会话不存在或已过期。')
  }
  const data: components['schemas']['ConfigDTO'] = {
    apiVersion: 'v1',
    serverTime: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    currentTermId: MOCK_TERM.id,
    terms: [{ ...MOCK_TERM }],
    features: { aiTutoring: false, learningAnalytics: false, serverChecks: false },
  }
  return ok(data)
}

export const authHandlers: Record<string, MockHandler> = {
  getCsrfToken: getCsrfTokenHandler,
  login: loginHandler,
  register: registerHandler,
  logout: logoutHandler,
  getMe: getMeHandler,
  getConfig: getConfigHandler,
}

export const MOCK_ACCOUNT_HINT = 'student.demo / teacher.demo / admin.demo，口令 mock-demo-pass'
