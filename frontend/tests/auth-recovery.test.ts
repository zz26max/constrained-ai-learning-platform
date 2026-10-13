import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { registerAuthApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient, TransportError } from '../src/api/client'
import { useAuthStore } from '../src/stores/auth'
import { createCsrfRefreshCoordinator } from '../src/stores/csrf-refresh'
import {
  createScriptedTransport,
  DEMO_CONFIG,
  DEMO_USER,
  failEnvelope,
  okEnvelope,
  operationIds,
  type ScriptedResponse,
  type ScriptedTransport,
} from './helpers'

let scripted: ScriptedTransport
let store: ReturnType<typeof useAuthStore>

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function happyResponse(operationId: string): ScriptedResponse {
  switch (operationId) {
    case 'getCsrfToken':
      return okEnvelope({ csrfToken: 'csrf-before-recovery' })
    case 'login':
      return okEnvelope({
        user: { ...DEMO_USER, roles: [...DEMO_USER.roles] },
        csrfToken: 'csrf-after-login',
      })
    case 'getMe':
      return okEnvelope({ ...DEMO_USER, roles: [...DEMO_USER.roles] })
    case 'getConfig':
      return okEnvelope({ ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] })
    case 'logout':
      return okEnvelope({ loggedOut: true })
    default:
      throw new TransportError(`未脚本化操作：${operationId}`)
  }
}

async function authenticatedSession(): Promise<void> {
  scripted.setHandler((request) => happyResponse(request.operationId))
  await store.ensureBoot()
  scripted.requests.length = 0
}

const requestsFor = (operationId: string) =>
  scripted.requests.filter((request) => request.operationId === operationId)

beforeEach(() => {
  setActivePinia(createPinia())
  scripted = createScriptedTransport()
  registerAuthApi(new AuthApi(new ApiClient(scripted.transport)))
  store = useAuthStore()
})

describe('P0-A 认证异常恢复', () => {
  it('login 200 后 /me 401：不报登录成功，清旧身份并保留身份请求的 requestId', async () => {
    await authenticatedSession()
    scripted.setHandler((request) =>
      request.operationId === 'getMe'
        ? failEnvelope(401, 'UNAUTHENTICATED', {}, 'req-me-expired')
        : happyResponse(request.operationId),
    )

    expect(await store.login('student.demo', 'any-pass')).toBe(false)
    expect(store.phase).toBe('anonymous')
    expect(store.identity).toBeNull()
    expect(store.config).toBeNull()
    expect(store.csrfToken).toBeNull()
    expect(store.loginStatus).toBe('error')
    expect(store.loginFailure?.message).toContain('重新登录')
    expect(store.lastRequestId).toBe('req-me-expired')
    expect(operationIds(scripted.requests)).toEqual(['login', 'getMe'])
  })

  it('登录 CSRF 恢复刷新失败：清除旧 token，提示失败且不循环刷新或重放登录', async () => {
    store.$patch({ phase: 'anonymous', bootStatus: 'success', csrfToken: 'stale-login-token' })
    scripted.setHandler((request) => {
      if (request.operationId === 'login') {
        return failEnvelope(403, 'CSRF_INVALID', {}, 'req-login-csrf')
      }
      if (request.operationId === 'getCsrfToken') throw new TransportError('令牌刷新断网')
      return happyResponse(request.operationId)
    })

    expect(await store.login('student.demo', 'any-pass')).toBe(false)
    expect(store.csrfToken).toBeNull()
    expect(store.loginStatus).toBe('error')
    expect(['csrf-stalled', 'unavailable']).toContain(store.loginFailure?.kind)
    expect(store.loginFailure?.message).toContain('重新登录')
    expect(store.loginFailure?.message).not.toContain('已刷新')
    expect(store.lastRequestId).toBe('req-login-csrf')
    expect(operationIds(scripted.requests)).toEqual(['login', 'getCsrfToken'])
  })

  it('连续退出 CSRF 失败：首次刷新并核对身份，第二次停止恢复，第三次不再刷新', async () => {
    await authenticatedSession()
    let logoutAttempts = 0
    scripted.setHandler((request) => {
      if (request.operationId === 'logout') {
        logoutAttempts += 1
        return failEnvelope(403, 'CSRF_INVALID', {}, `req-logout-${logoutAttempts}`)
      }
      if (request.operationId === 'getCsrfToken') return okEnvelope({ csrfToken: 'csrf-recovered' })
      return happyResponse(request.operationId)
    })

    expect(await store.logout()).toBe(false)
    expect(operationIds(scripted.requests)).toEqual(['logout', 'getCsrfToken', 'getMe'])
    expect(store.phase).toBe('authenticated')
    expect(store.csrfToken).toBe('csrf-recovered')
    expect(store.logoutFailure).toBeTypeOf('string')

    expect(await store.logout()).toBe(false)
    expect(requestsFor('logout')).toHaveLength(2)
    expect(requestsFor('getCsrfToken')).toHaveLength(1)
    expect(requestsFor('getMe')).toHaveLength(1)
    expect(store.logoutFailure).toContain('重新登录')
    expect(store.lastRequestId).toBe('req-logout-2')

    expect(await store.logout()).toBe(false)
    expect(requestsFor('getCsrfToken')).toHaveLength(1)
    expect(requestsFor('getMe')).toHaveLength(1)
    expect(store.logoutFailure).toContain('重新登录')
  })

  it('并发退出 CSRF 失败：只共用一次 token 刷新和 /me，不自动重放退出', async () => {
    await authenticatedSession()
    const refresh = deferred<ScriptedResponse>()
    scripted.setHandler((request) => {
      if (request.operationId === 'logout') return failEnvelope(403, 'CSRF_INVALID', {}, 'req-logout-shared')
      if (request.operationId === 'getCsrfToken') return refresh.promise
      return happyResponse(request.operationId)
    })

    const first = store.logout()
    const second = store.logout()
    await vi.waitFor(() => expect(requestsFor('getCsrfToken')).toHaveLength(1))
    refresh.resolve(okEnvelope({ csrfToken: 'csrf-shared' }))

    expect(await Promise.all([first, second])).toEqual([false, false])
    expect(requestsFor('logout')).toHaveLength(2)
    expect(requestsFor('getCsrfToken')).toHaveLength(1)
    expect(requestsFor('getMe')).toHaveLength(1)
    expect(store.phase).toBe('authenticated')
    expect(store.identity?.id).toBe(DEMO_USER.id)
    expect(store.csrfToken).toBe('csrf-shared')
    expect(store.logoutFailure).toBeTypeOf('string')
    expect(store.logoutFailure).not.toContain('重新登录')
  })

  it('退出恢复 /me 返回另一用户：清旧身份、配置和 token，要求重新登录', async () => {
    await authenticatedSession()
    scripted.setHandler((request) => {
      if (request.operationId === 'logout') return failEnvelope(403, 'CSRF_INVALID', {}, 'req-user-changed')
      if (request.operationId === 'getCsrfToken') return okEnvelope({ csrfToken: 'csrf-other-user' })
      if (request.operationId === 'getMe') {
        return okEnvelope({
          ...DEMO_USER,
          id: '00000000-0000-4000-8000-000000000002',
          username: 'another.demo',
          displayName: '另一演示用户',
          roles: [...DEMO_USER.roles],
        })
      }
      return happyResponse(request.operationId)
    })

    expect(await store.logout()).toBe(false)
    expect(operationIds(scripted.requests)).toEqual(['logout', 'getCsrfToken', 'getMe'])
    expect(store.phase).toBe('anonymous')
    expect(store.identity).toBeNull()
    expect(store.config).toBeNull()
    expect(store.csrfToken).toBeNull()
    expect(store.logoutFailure).toContain('重新登录')
    expect(store.lastRequestId).toBe('req-user-changed')
  })

  it('并发退出的共用刷新失败：所有退出调用均失败，清旧 token 并显示重新登录', async () => {
    await authenticatedSession()
    const refresh = deferred<ScriptedResponse>()
    scripted.setHandler((request) => {
      if (request.operationId === 'logout') return failEnvelope(403, 'CSRF_INVALID', {}, 'req-shared-refresh-failed')
      if (request.operationId === 'getCsrfToken') return refresh.promise
      return happyResponse(request.operationId)
    })

    const first = store.logout()
    const second = store.logout()
    const results = Promise.all([first, second])
    await vi.waitFor(() => expect(requestsFor('getCsrfToken')).toHaveLength(1))
    refresh.reject(new TransportError('共用刷新失败'))

    expect(await results).toEqual([false, false])
    expect(requestsFor('logout')).toHaveLength(2)
    expect(requestsFor('getCsrfToken')).toHaveLength(1)
    expect(store.csrfToken).toBeNull()
    expect(store.logoutFailure).toContain('重新登录')
    expect(store.lastRequestId).toBe('req-shared-refresh-failed')
  })

  it('协调器共享刷新拒绝：首个与共享调用都传播同一个错误，不吞掉共享失败', async () => {
    const refresh = deferred<void>()
    let refreshCalls = 0
    const coordinator = createCsrfRefreshCoordinator(() => {
      refreshCalls += 1
      return refresh.promise
    })
    const error = new TransportError('刷新服务不可用')

    const first = coordinator.recover()
    const second = coordinator.recover()
    const results = Promise.allSettled([first, second])
    refresh.reject(error)

    const settled = await results
    expect(refreshCalls).toBe(1)
    expect(settled.map((result) => result.status)).toEqual(['rejected', 'rejected'])
    for (const result of settled) {
      if (result.status === 'rejected') expect(result.reason).toBe(error)
    }
  })
})
