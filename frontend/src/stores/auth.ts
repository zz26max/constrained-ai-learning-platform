import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, TransportError } from '../api/client'
import { authApi } from '../api'
import type { AuthApi } from '../api/auth'
import type { components } from '../api/generated/schema'
import { createCsrfRefreshCoordinator } from './csrf-refresh'
import { clearWorkspaceRecovery } from '../features/assignments/workspace-recovery'

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

/** 身份只在内存保存；CSRF 恢复遵循契约 1.1.0，不自动重放写请求。 */
export const useAuthStore = defineStore('auth', () => {
  const api: AuthApi = authApi()

  const phase = ref<AuthPhase>('booting')
  const bootStatus = ref<RequestPhase>('idle')
  const identity = ref<UserDTO | null>(null)
  const config = ref<ConfigDTO | null>(null)
  const csrfToken = ref<string | null>(null)
  const loginStatus = ref<RequestPhase>('idle')
  const loginFailure = ref<LoginFailure | null>(null)
  // 本地操作提示，不是接口字段或业务错误码。
  const logoutFailure = ref<string | null>(null)
  const lastRequestId = ref<string | null>(null)
  const identityRequestId = ref<string | null>(null)

  let loginRecoveryUsed = false
  let logoutRecoveryUsed = false
  let actionRecoveryUsed = false
  const csrfRefresh = createCsrfRefreshCoordinator(refreshCsrfAndIdentity)

  function resetRecoveryFlags(): void {
    loginRecoveryUsed = false
    logoutRecoveryUsed = false
    actionRecoveryUsed = false
  }

  function clearAuthenticatedState(): void {
    identity.value = null
    config.value = null
    csrfToken.value = null
    identityRequestId.value = null
    phase.value = 'anonymous'
    bootStatus.value = 'success'
    resetRecoveryFlags()
    // lastRequestId 留给失败提示；不能把身份清理显示为退出成功。
  }

  async function refreshCsrfToken(): Promise<void> {
    const userId = identity.value?.id
    csrfToken.value = null
    const result = await api.getCsrfToken()
    if (identity.value?.id === userId) csrfToken.value = result.data.csrfToken
  }

  /** 已登录时共享整次恢复：取 token 与 /me，同时核对是否仍为同一用户。 */
  async function refreshCsrfAndIdentity(): Promise<void> {
    const userId = identity.value?.id
    csrfToken.value = null
    if (userId === undefined) {
      await refreshCsrfToken()
      resetRecoveryFlags()
      return
    }
    const [token, me] = await Promise.all([api.getCsrfToken(), api.getMe()])
    if (me.data.id !== userId || identity.value?.id !== userId) {
      clearAuthenticatedState()
      throw new Error('登录身份已变化，请重新登录。')
    }
    identity.value = me.data
    identityRequestId.value = me.requestId
    csrfToken.value = token.data.csrfToken
    // 恢复成功只结束本次连续失败链；下一批 CSRF_INVALID 可以再次恢复。
    resetRecoveryFlags()
  }

  async function ensureCsrfToken(): Promise<string> {
    if (csrfToken.value !== null) return csrfToken.value
    await refreshCsrfToken()
    const token = csrfToken.value
    if (token === null) throw new TransportError('未能获得登录令牌，请稍后重试。')
    return token
  }

  async function loadConfig(): Promise<void> {
    const userId = identity.value?.id
    try {
      const result = await api.getConfig()
      if (identity.value?.id === userId && phase.value === 'authenticated') {
        config.value = result.data
      }
    } catch {
      // 配置读取失败不清除已核对的身份；配置相关功能按不可用显示。
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
        clearAuthenticatedState()
      } else {
        // 网络/服务不可用不伪装成匿名。
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

  /** 登录响应与 /me 均成功才确认身份；失败恢复不重放登录。 */
  async function login(username: string, password: string): Promise<boolean> {
    if (loginStatus.value === 'loading') return false
    loginStatus.value = 'loading'
    loginFailure.value = null
    lastRequestId.value = null
    let loginAccepted = false
    try {
      const token = await ensureCsrfToken()
      const result = await api.login({ username, password }, token)
      loginAccepted = true
      csrfToken.value = result.data.csrfToken
      const me = await api.getMe()
      identity.value = me.data
      identityRequestId.value = me.requestId
      config.value = null
      clearWorkspaceRecovery(me.data.id)
      phase.value = 'authenticated'
      await loadConfig()
      loginStatus.value = 'success'
      logoutFailure.value = null
      return true
    } catch (error) {
      if (loginAccepted) clearAuthenticatedState()
      loginStatus.value = 'error'
      if (error instanceof ApiError) {
        lastRequestId.value = error.requestId
        if (error.status === 403 && error.code === 'CSRF_INVALID') {
          if (loginRecoveryUsed) {
            clearAuthenticatedState()
            loginFailure.value = {
              kind: 'csrf-stalled',
              message: '登录令牌再次校验失败，请刷新页面后重新登录。',
            }
          } else {
            loginRecoveryUsed = true
            try {
              await csrfRefresh.recover()
              loginFailure.value = {
                kind: 'csrf',
                message: '登录令牌已刷新，请重新点击“登录”。',
              }
            } catch {
              clearAuthenticatedState()
              loginFailure.value = {
                kind: 'csrf-stalled',
                message: '登录令牌刷新或身份核对失败，请重新登录。',
              }
            } finally {
              // 恢复成功时 refreshCsrfAndIdentity 会先清零；本次登录重试仍只允许一次。
              loginRecoveryUsed = true
            }
          }
        } else if (error.status === 401 && error.code === 'UNAUTHENTICATED') {
          clearAuthenticatedState()
          loginFailure.value = { kind: 'unavailable', message: '登录身份已失效，请重新登录。' }
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
              ? '（约 ' + error.retryAfterSeconds + ' 秒后可重试）'
              : ''
          loginFailure.value = { kind: 'rate', message: '尝试过于频繁，请稍后再试' + wait + '。' }
        } else {
          loginFailure.value = { kind: 'unavailable', message: '服务暂不可用，请稍后重试。' }
        }
      } else {
        loginFailure.value = { kind: 'unavailable', message: '网络连接失败，请稍后重试。' }
      }
      return false
    }
  }

  /** 退出：401 清理身份；CSRF 首次恢复后由用户重试，再次失败停止恢复。 */
  async function logout(): Promise<boolean> {
    if (phase.value !== 'authenticated') return false
    const userId = identity.value?.id
    logoutFailure.value = null
    try {
      const token = await ensureCsrfToken()
      await api.logout(token)
    } catch (error) {
      if (error instanceof ApiError) lastRequestId.value = error.requestId
      if (error instanceof ApiError && error.status === 401) {
        // 会话已不存在：继续清理本地状态。
      } else if (error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID') {
        if (logoutRecoveryUsed) {
          clearAuthenticatedState()
          logoutFailure.value = '退出安全校验再次失败，请重新登录。'
        } else {
          try {
            await csrfRefresh.recover()
            logoutFailure.value = '令牌已刷新，退出尚未完成，请重新点击“退出登录”。'
          } catch {
            clearAuthenticatedState()
            logoutFailure.value = '令牌刷新或身份核对失败，请重新登录。'
          } finally {
            // 进行中的失败共用一次恢复；恢复结束后的用户重试不得再刷新。
            logoutRecoveryUsed = true
          }
        }
        return false
      } else {
        logoutFailure.value = '退出失败，请稍后重试。'
        return false
      }
    }
    if (identity.value?.id !== userId) return false
    clearAuthenticatedState()
    clearWorkspaceRecovery()
    loginStatus.value = 'idle'
    loginFailure.value = null
    logoutFailure.value = null
    return true
  }

  /** 教学页面复用认证恢复：连续两次 CSRF 失败才放弃，不按会话累计。 */
  async function recoverCsrfFailure(requestId: string | null): Promise<string> {
    lastRequestId.value = requestId
    if (actionRecoveryUsed) {
      clearAuthenticatedState()
      loginFailure.value = { kind: 'csrf-stalled', message: '安全校验再次失败，请重新登录。' }
      return loginFailure.value.message
    }
    try {
      await csrfRefresh.recover()
      return '安全令牌已刷新，原操作尚未完成，请重新操作。'
    } catch {
      clearAuthenticatedState()
      loginFailure.value = { kind: 'csrf-stalled', message: '安全令牌刷新或身份核对失败，请重新登录。' }
      return loginFailure.value.message
    } finally { actionRecoveryUsed = true }
  }

  async function recoverIdentity(_requestId: string | null): Promise<boolean> {
    try {
      await csrfRefresh.recover()
      return true
    } catch {
      clearAuthenticatedState()
      loginFailure.value = { kind: 'unavailable', message: '登录身份已失效，请重新登录。' }
      return false
    }
  }

  /** 写操作成功后结束 action 的连续失败链。 */
  function markActionSucceeded(): void {
    actionRecoveryUsed = false
  }

  return {
    phase,
    bootStatus,
    identity,
    config,
    csrfToken,
    loginStatus,
    loginFailure,
    logoutFailure,
    lastRequestId,
    identityRequestId,
    ensureBoot,
    retryBoot,
    login,
    logout,
    ensureCsrfToken,
    recoverCsrfFailure,
    recoverIdentity,
    markActionSucceeded,
  }
})
