import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { registerAuthApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient, TransportError } from '../src/api/client'
import { useAuthStore } from '../src/stores/auth'
import {
  createScriptedTransport,
  DEMO_CONFIG,
  DEMO_USER,
  failEnvelope,
  okEnvelope,
  operationIds,
  type ScriptHandler,
  type ScriptedTransport,
} from './helpers'

let scripted: ScriptedTransport
let store: ReturnType<typeof useAuthStore>

/** 认证全流程脚本：按 operationId 分派响应，可按用例覆盖。 */
function happyAuthScript(): ScriptHandler {
  return (request) => {
    switch (request.operationId) {
      case 'getCsrfToken':
        return okEnvelope({ csrfToken: 'csrf-t1' })
      case 'login':
        return okEnvelope({ user: { ...DEMO_USER, roles: [...DEMO_USER.roles] }, csrfToken: 'csrf-t2' })
      case 'logout':
        return okEnvelope({ loggedOut: true })
      case 'getMe':
        return okEnvelope({ ...DEMO_USER, roles: [...DEMO_USER.roles] })
      case 'getConfig':
        return okEnvelope({ ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] })
      default:
        throw new TransportError(`未脚本化操作：${request.operationId}`)
    }
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  scripted = createScriptedTransport()
  registerAuthApi(new AuthApi(new ApiClient(scripted.transport)))
  store = useAuthStore()
})

describe('会话恢复（ensureBoot）', () => {
  it('匿名恢复：CSRF 后 /me 返回 401，进入匿名态', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'getMe') return failEnvelope(401, 'UNAUTHENTICATED')
      return happyAuthScript()(request)
    })
    await store.ensureBoot()
    expect(store.phase).toBe('anonymous')
    expect(store.bootStatus).toBe('success')
    expect(store.identity).toBeNull()
    expect(operationIds(scripted.requests)).toEqual(['getCsrfToken', 'getMe'])
  })

  it('已登录恢复：/me 与 config 成功，保持登录态', async () => {
    scripted.setHandler(happyAuthScript())
    await store.ensureBoot()
    expect(store.phase).toBe('authenticated')
    expect(store.identity?.username).toBe('student.demo')
    expect(store.config?.timezone).toBe('Asia/Shanghai')
    expect(operationIds(scripted.requests)).toEqual(['getCsrfToken', 'getMe', 'getConfig'])
  })

  it('服务不可用进入错误态，可重试', async () => {
    scripted.setHandler(() => {
      throw new TransportError('后端不可用')
    })
    await store.ensureBoot()
    expect(store.bootStatus).toBe('error')
    scripted.setHandler(happyAuthScript())
    await store.retryBoot()
    expect(store.bootStatus).toBe('success')
    expect(store.phase).toBe('authenticated')
  })
})

describe('登录（login）', () => {
  it('成功：令牌轮换、代次递增、按验收链读取 /me 与 config', async () => {
    scripted.setHandler(happyAuthScript())
    const ok = await store.login('student.demo', 'any-pass')
    expect(ok).toBe(true)
    expect(store.phase).toBe('authenticated')
    expect(store.identity?.username).toBe('student.demo')
    expect(store.csrfToken).toBe('csrf-t2')
    expect(store.userGeneration).toBe(1)
    expect(operationIds(scripted.requests)).toEqual(['getCsrfToken', 'login', 'getMe', 'getConfig'])
  })

  it('CSRF_INVALID：只刷新一次令牌，不自动重放；用户重试成功', async () => {
    let loginAttempts = 0
    let csrfIssued = 0
    scripted.setHandler((request) => {
      if (request.operationId === 'login') {
        loginAttempts += 1
        if (loginAttempts === 1) return failEnvelope(403, 'CSRF_INVALID')
        return okEnvelope({ user: { ...DEMO_USER, roles: [...DEMO_USER.roles] }, csrfToken: 'csrf-t2' })
      }
      if (request.operationId === 'getCsrfToken') {
        csrfIssued += 1
        return okEnvelope({ csrfToken: `csrf-${csrfIssued}` })
      }
      return happyAuthScript()(request)
    })
    const first = await store.login('student.demo', 'any-pass')
    expect(first).toBe(false)
    expect(store.loginFailure?.kind).toBe('csrf')
    expect(store.phase).toBe('booting')
    // 只有一次登录请求（无自动重放），令牌刷新恰好一次
    expect(scripted.requests.filter((r) => r.operationId === 'login').length).toBe(1)
    expect(scripted.requests.filter((r) => r.operationId === 'getCsrfToken').length).toBe(2)
    // 用户重新提交：使用新令牌成功
    const second = await store.login('student.demo', 'any-pass')
    expect(second).toBe(true)
    expect(store.phase).toBe('authenticated')
  })

  it('CSRF_INVALID 重试后仍失败：停止自动恢复，不再刷新令牌', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'login') return failEnvelope(403, 'CSRF_INVALID')
      return happyAuthScript()(request)
    })
    await store.login('student.demo', 'any-pass')
    await store.login('student.demo', 'any-pass')
    expect(store.loginFailure?.kind).toBe('csrf-stalled')
    // ensure 一次 + 失败刷新一次；第二次失败不再触发刷新
    expect(scripted.requests.filter((r) => r.operationId === 'getCsrfToken').length).toBe(2)
    expect(scripted.requests.filter((r) => r.operationId === 'login').length).toBe(2)
  })

  it('凭据错误：401 显示凭据失败', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'login') return failEnvelope(401, 'INVALID_CREDENTIALS')
      return happyAuthScript()(request)
    })
    const ok = await store.login('student.demo', 'wrong')
    expect(ok).toBe(false)
    expect(store.loginFailure?.kind).toBe('credentials')
    expect(store.phase).toBe('booting')
  })

  it('输入校验失败：422 保留字段错误', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'login') {
        return failEnvelope(422, 'VALIDATION_ERROR', {
          fields: [{ field: 'password', message: '密码不能为空。' }],
        })
      }
      return happyAuthScript()(request)
    })
    await store.login('student.demo', '')
    const failure = store.loginFailure
    if (failure === null || failure.kind !== 'validation') {
      throw new Error('应为校验失败')
    }
    expect(failure.fields).toEqual([{ field: 'password', message: '密码不能为空。' }])
  })

  it('限流：429 显示稍后再试', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'login') {
        return {
          status: 429,
          body: { error: { code: 'RATE_LIMITED', message: '稍后再试', details: {} }, requestId: 'r' },
          headers: { 'retry-after': '30' },
        }
      }
      return happyAuthScript()(request)
    })
    await store.login('student.demo', 'any-pass')
    expect(store.loginFailure?.kind).toBe('rate')
  })

  it('旧代次结果不落地：登录响应落地前代次已变化则丢弃', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'login') {
        // 模拟登录期间另一动作改变了用户代次
        store.$patch({ userGeneration: 99 })
        return okEnvelope({ user: { ...DEMO_USER, roles: [...DEMO_USER.roles] }, csrfToken: 'x' })
      }
      return happyAuthScript()(request)
    })
    const ok = await store.login('student.demo', 'any-pass')
    expect(ok).toBe(false)
    expect(store.phase).toBe('booting')
    expect(store.identity).toBeNull()
  })
})

describe('退出（logout）', () => {
  it('成功：清空身份与配置，代次递增', async () => {
    scripted.setHandler(happyAuthScript())
    await store.ensureBoot()
    const ok = await store.logout()
    expect(ok).toBe(true)
    expect(store.phase).toBe('anonymous')
    expect(store.identity).toBeNull()
    expect(store.config).toBeNull()
    expect(store.userGeneration).toBe(1)
  })

  it('401（会话已失效）：同样清理本地状态', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'logout') return failEnvelope(401, 'UNAUTHENTICATED')
      return happyAuthScript()(request)
    })
    await store.ensureBoot()
    const ok = await store.logout()
    expect(ok).toBe(true)
    expect(store.phase).toBe('anonymous')
  })

  it('网络失败：保留登录态供重试', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'logout') throw new TransportError('断网')
      return happyAuthScript()(request)
    })
    await store.ensureBoot()
    const ok = await store.logout()
    expect(ok).toBe(false)
    expect(store.phase).toBe('authenticated')
    expect(store.identity?.username).toBe('student.demo')
  })
})
