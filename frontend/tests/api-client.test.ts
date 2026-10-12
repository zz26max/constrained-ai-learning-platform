import { describe, expect, it } from 'vitest'
import { ApiClient, ApiError, TransportError } from '../src/api/client'
import { AUTH_SPECS } from '../src/api/auth'
import {
  createScriptedTransport,
  failEnvelope,
  okEnvelope,
  operationIds,
} from './helpers'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

describe('ApiClient 统一请求层', () => {
  it('成功响应只解包一次 data，并带回正文 requestId', async () => {
    const scripted = createScriptedTransport()
    const client = new ApiClient(scripted.transport)
    scripted.setHandler(() => okEnvelope({ csrfToken: 'token-1' }, 'req-9'))
    const result = await client.request<{ csrfToken: string }>(AUTH_SPECS.getCsrfToken)
    expect(result.data).toEqual({ csrfToken: 'token-1' })
    expect(result.requestId).toBe('req-9')
  })

  it('正文缺 requestId 时回退响应头 X-Request-ID', async () => {
    const scripted = createScriptedTransport()
    const client = new ApiClient(scripted.transport)
    scripted.setHandler(() => ({
      status: 200,
      body: { data: { csrfToken: 't' } },
      headers: { 'x-request-id': 'req-h' },
    }))
    const result = await client.request<{ csrfToken: string }>(AUTH_SPECS.getCsrfToken)
    expect(result.requestId).toBe('req-h')
  })

  it('错误响应映射为结构化 ApiError（状态、错误码、详情、requestId）', async () => {
    const scripted = createScriptedTransport()
    const client = new ApiClient(scripted.transport)
    scripted.setHandler(() =>
      failEnvelope(401, 'INVALID_CREDENTIALS', {}, 'req-401'),
    )
    let caught: unknown
    try {
      await client.request(AUTH_SPECS.getMe)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ApiError)
    const apiError = caught as ApiError
    expect(apiError.status).toBe(401)
    expect(apiError.code).toBe('INVALID_CREDENTIALS')
    expect(apiError.errorDetails).toEqual({})
    expect(apiError.requestId).toBe('req-401')
  })

  it('422 的 details.fields 原样保留', async () => {
    const scripted = createScriptedTransport()
    const client = new ApiClient(scripted.transport)
    scripted.setHandler(() =>
      failEnvelope(422, 'VALIDATION_ERROR', {
        fields: [{ field: 'username', message: '用户名不能为空。' }],
      }),
    )
    await expect(client.request(AUTH_SPECS.getMe)).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof ApiError &&
        error.status === 422 &&
        JSON.stringify(error.errorDetails).includes('用户名不能为空。')
      )
    })
  })

  it('429 解析 Retry-After 响应头', async () => {
    const scripted = createScriptedTransport()
    const client = new ApiClient(scripted.transport)
    scripted.setHandler(() => ({
      status: 429,
      body: { error: { code: 'RATE_LIMITED', message: '稍后再试', details: {} }, requestId: 'r' },
      headers: { 'retry-after': '30' },
    }))
    await expect(client.request(AUTH_SPECS.getMe)).rejects.toSatisfy((error: unknown) => {
      return error instanceof ApiError && error.retryAfterSeconds === 30
    })
  })

  it('响应不是合法 JSON 时抛出 TransportError，不伪装成空数据', async () => {
    const scripted = createScriptedTransport()
    // 直接模拟非 JSON 文本
    scripted.transport.request = async () => ({
      status: 200,
      headers: {},
      bodyText: '<html>not json</html>',
    })
    const client = new ApiClient(scripted.transport)
    await expect(client.request(AUTH_SPECS.getMe)).rejects.toBeInstanceOf(TransportError)
  })

  it('网络层失败原样传播 TransportError，不转换成空数组', async () => {
    const scripted = createScriptedTransport()
    scripted.setHandler(() => {
      throw new TransportError('连接失败')
    })
    const client = new ApiClient(scripted.transport)
    await expect(client.request(AUTH_SPECS.getMe)).rejects.toBeInstanceOf(TransportError)
  })

  it('发送 X-Request-ID 并携带 CSRF 头；query 序列化到路径', async () => {
    const scripted = createScriptedTransport()
    const client = new ApiClient(scripted.transport)
    scripted.setHandler(() => okEnvelope({ loggedOut: true }))
    await client.request(AUTH_SPECS.logout, {
      body: {},
      csrfToken: 'csrf-1',
      query: { offeringId: 'abc' },
    })
    const request = scripted.requests[0]
    if (request === undefined) throw new Error('请求未发出')
    expect(request.method).toBe('POST')
    expect(request.path).toBe('/api/v1/auth/logout?offeringId=abc')
    expect(request.headers['X-CSRF-Token']).toBe('csrf-1')
    expect(request.headers['X-Request-ID']).toMatch(REQUEST_ID_PATTERN)
    expect(request.body).toBe('{}')
    expect(operationIds(scripted.requests)).toEqual(['logout'])
  })

  it('要求 CSRF 的操作缺少令牌时不发出请求', async () => {
    const scripted = createScriptedTransport()
    const client = new ApiClient(scripted.transport)
    scripted.setHandler(() => okEnvelope({}))
    await expect(client.request(AUTH_SPECS.login, { body: {} })).rejects.toBeInstanceOf(
      TransportError,
    )
    expect(scripted.requests.length).toBe(0)
  })

  it('已中止的 signal 使请求中止', async () => {
    const scripted = createScriptedTransport()
    const client = new ApiClient(scripted.transport)
    scripted.setHandler(() => okEnvelope({}))
    const controller = new AbortController()
    controller.abort()
    await expect(
      client.request(AUTH_SPECS.getMe, { signal: controller.signal }),
    ).rejects.toSatisfy((error: unknown) => {
      return error instanceof DOMException && error.name === 'AbortError'
    })
  })
})
