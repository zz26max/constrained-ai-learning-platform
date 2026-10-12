import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, TransportError } from '../api/client'
import { authApi } from '../api'
import type { AuthApi } from '../api/auth'
import type { components } from '../api/generated/schema'
import { createCsrfRefreshCoordinator } from './csrf-refresh'

type UserDTO = components['schemas']['UserDTO']
type ConfigDTO = components['schemas']['ConfigDTO']
type FieldError = components['schemas']['FieldError']

export type RequestPhase = 'idle' | 'loading' | 'success' | 'error'
export type AuthPhase = 'booting' | 'anonymous' | 'authenticated'

export type LoginFailure =
  | { kind: 'credentials'; message: string }
  | { kind: 'csrf'; message: string }
  | { kind: 'csrf-stalled'; message: string }
  | { kind: 'validation'; message: string; fields: FieldError[] }
  | { kind: 'rate'; message: string }
  | { kind: 'unavailable'; message: string }

/**
 * 认证状态（FRONTEND.md 2/4）：
 * - 会话令牌只在内存，不进 localStorage；服务端角色是权限来源。
 * - userGeneration 是用户代次：登录/退出递增；响应落地前核对代次，
 *   旧代次结果不得覆盖新用户数据。
 * - CSRF_INVALID 恢复按 DEVELOPMENT.md 10.2：不自动重放写请求。
 */
export const useAuthStore = defineStore('auth', () => {
  const api: AuthApi = authApi()

  const phase = ref<AuthPhase>('booting')
  const bootStatus = ref<RequestPhase>('idle')
  const identity = ref<UserDTO | null>(null)
  const config = ref<ConfigDTO | null>(null)
  const csrfToken = ref<string | null>(null)
  const userGeneration = ref(0)
  const loginStatus = ref<RequestPhase>('idle')
  const loginFailure = ref<LoginFailure | null>(null)
  const lastRequestId = ref<string | null>(null)
  const identityRequestId = ref<string | null>(null)

  let consecutiveCsrfFailures = 0

  const csrfRefresh = createCsrfRefreshCoordinator(
    () => refreshCsrfToken(),
    () => userGeneration.value,
  )

  async function refreshCsrfToken(): Promise<void> {
    const generation = userGeneration.value
    const result = await api.getCsrfToken()
    if (userGeneration.value !== generation) return
    csrfToken.value = result.data.csrfToken
  }

  async function ensureCsrfToken(): Promise<string> {
    if (csrfToken.value !== null) return csrfToken.value
    await refreshCsrfToken()
    const token = csrfToken.value
    if (token === null) {
      throw new TransportError('未能获得登录令牌，请稍后重试。')
    }
    return token
  }

  async function loadConfig(): Promise<void> {
    const generation = userGeneration.value
    try {
      const result = await api.getConfig()
      if (userGeneration.value !== generation) return
      config.value = result.data
    } catch {
      // 配置读取失败不清除登录态；配置相关功能按不可用显示。
    }
  }

  /** 首次导航恢复会话：取 CSRF → /me（401 即匿名）→ config。 */
  async function ensureBoot(): Promise<void> {
    if (bootStatus.value !== 'idle') return
    bootStatus.value = 'loading'
    try {
      await refreshCsrfToken()
      const me = await api.getMe()
      identity.value = me.data
      identityRequestId.value = me.requestId
      phase.value = 'authenticated'
      await loadConfig()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        phase.value = 'anonymous'
        identity.value = null
      } else {
        // 网络/服务不可用：保留可重试的错误态，不伪装成匿名。
        bootStatus.value = 'error'
        return
      }
    }
    bootStatus.value = 'success'
  }

  async function retryBoot(): Promise<void> {
    bootStatus.value = 'idle'
    await ensureBoot()
  }

  function parseFieldErrors(details: unknown): FieldError[] {
    if (details === null || typeof details !== 'object') return []
    const fields = (details as { fields?: unknown }).fields
    if (!Array.isArray(fields)) return []
    return fields.filter(
      (item): item is FieldError =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { field?: unknown }).field === 'string' &&
        typeof (item as { message?: unknown }).message === 'string',
    )
  }

  /** 登录：CSRF → login → 代次核对 → /me 验证 → config；403 CSRF_INVALID 只刷新令牌，等用户重新提交。 */
  async function login(username: string, password: string): Promise<boolean> {
    if (loginStatus.value === 'loading') return false
    const generation = userGeneration.value
    loginStatus.value = 'loading'
    loginFailure.value = null
    try {
      const token = await ensureCsrfToken()
      const result = await api.login({ username, password }, token)
      if (userGeneration.value !== generation) {
        loginStatus.value = 'idle'
        return false
      }
      csrfToken.value = result.data.csrfToken
      identity.value = result.data.user
      identityRequestId.value = result.requestId
      userGeneration.value += 1
      phase.value = 'authenticated'
      loginStatus.value = 'success'
      consecutiveCsrfFailures = 0
      // 登录后按验收链读取 /me 与 config；失败不回滚登录态，后续读取走 401 恢复。
      try {
        const me = await api.getMe()
        if (userGeneration.value === generation + 1) {
          identity.value = me.data
          identityRequestId.value = me.requestId
        }
        await loadConfig()
      } catch {
        // 保留登录响应中的身份
      }
      return true
    } catch (error) {
      if (userGeneration.value !== generation) {
        loginStatus.value = 'idle'
        return false
      }
      loginStatus.value = 'error'
      if (error instanceof ApiError) {
        lastRequestId.value = error.requestId
        if (error.status === 403 && error.code === 'CSRF_INVALID') {
          consecutiveCsrfFailures += 1
          if (consecutiveCsrfFailures >= 2) {
            // 重试后仍失败：停止自动恢复，提供刷新重入入口（DEVELOPMENT.md 10.2 第 4 条）
            loginFailure.value = {
              kind: 'csrf-stalled',
              message: '多次登录令牌校验失败，请刷新页面后重新登录。',
            }
          } else {
            await csrfRefresh.recover().catch(() => {})
            loginFailure.value = {
              kind: 'csrf',
              message: '登录令牌已刷新，请重新点击“登录”。',
            }
          }
        } else if (error.status === 401 && error.code === 'INVALID_CREDENTIALS') {
          loginFailure.value = { kind: 'credentials', message: '用户名或密码错误。' }
        } else if (error.status === 422 && error.code === 'VALIDATION_ERROR') {
          loginFailure.value = {
            kind: 'validation',
            message: '输入不合法，请修改后重试。',
            fields: parseFieldErrors(error.errorDetails),
          }
        } else if (error.status === 429 && error.code === 'RATE_LIMITED') {
          const wait =
            error.retryAfterSeconds !== null && error.retryAfterSeconds > 0
              ? `（约 ${error.retryAfterSeconds} 秒后可重试）`
              : ''
          loginFailure.value = { kind: 'rate', message: `尝试过于频繁，请稍后再试${wait}。` }
        } else {
          loginFailure.value = { kind: 'unavailable', message: '服务暂不可用，请稍后重试。' }
        }
      } else {
        loginFailure.value = { kind: 'unavailable', message: '网络连接失败，请稍后重试。' }
      }
      return false
    }
  }

  /** 退出：401 视为会话已失效，按退出完成清理；其他失败保留登录态供重试。 */
  async function logout(): Promise<boolean> {
    if (phase.value !== 'authenticated') return false
    const generation = userGeneration.value
    try {
      const token = await ensureCsrfToken()
      await api.logout(token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // 会话已不存在：继续清理本地状态
      } else if (error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID') {
        await csrfRefresh.recover().catch(() => {})
        return false // 提示用户重试，不自动重放写请求
      } else {
        return false // 网络/服务失败：保留登录态
      }
    }
    if (userGeneration.value !== generation) return false
    identity.value = null
    config.value = null
    csrfToken.value = null
    identityRequestId.value = null
    consecutiveCsrfFailures = 0
    userGeneration.value += 1
    phase.value = 'anonymous'
    loginStatus.value = 'idle'
    loginFailure.value = null
    return true
  }

  return {
    phase,
    bootStatus,
    identity,
    config,
    csrfToken,
    userGeneration,
    loginStatus,
    loginFailure,
    lastRequestId,
    identityRequestId,
    ensureBoot,
    retryBoot,
    login,
    logout,
  }
})
