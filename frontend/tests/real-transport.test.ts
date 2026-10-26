import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { realTransport, REQUEST_DEADLINE_MS } from '../src/api/real-transport'
import { ApiError, TransportError } from '../src/api/client'
import type { TransportRequest } from '../src/api/transport'

const request: TransportRequest = {
  operationId: 'getMe', method: 'GET', path: '/api/v1/me', headers: { Accept: 'application/json' },
}

function jsonResponse(body: unknown): Response {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** 模拟真实 fetch：跟随传入 signal 的中止（外层取消与本地截止都表现为 reject AbortError）。 */
function stubFetchHanging(): ReturnType<typeof vi.fn> {
  return vi.fn((_path: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted === true) { reject(new DOMException('Aborted', 'AbortError')); return }
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('realTransport 请求截止时间与取消语义（F4）', () => {
  it('响应一直不到：截止时间触发后抛可展示的超时 TransportError（非业务错误、非取消）', async () => {
    vi.stubGlobal('fetch', stubFetchHanging())
    const pending = realTransport.request(request)
    const assertion = expect(pending).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TransportError)
      expect(error).not.toBeInstanceOf(ApiError)
      expect((error as TransportError).message).toContain('超时')
      return true
    })
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS)
    await assertion
  })

  it('响应头已到但 body 读取卡住：同样受截止时间约束', async () => {
    const fetchWithStuckText = vi.fn((_path: string | URL, init?: RequestInit) => Promise.resolve({
      status: 200,
      headers: new Headers(),
      text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }),
    } as unknown as Response))
    vi.stubGlobal('fetch', fetchWithStuckText)
    const pending = realTransport.request(request)
    const assertion = expect(pending).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TransportError)
      expect((error as TransportError).message).toContain('超时')
      return true
    })
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS)
    await assertion
  })

  it('外层主动取消（路由/账号切换）：保持 AbortError 取消语义，不冒充超时', async () => {
    vi.stubGlobal('fetch', stubFetchHanging())
    const controller = new AbortController()
    const pending = realTransport.request(request, controller.signal)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
  })

  it('请求成功后释放截止定时器；截止时间内完成不产生超时错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { user: {} } })))
    const response = await realTransport.request(request)
    expect(response.status).toBe(200)
    expect(JSON.parse(response.bodyText)).toEqual({ data: { user: {} } })
    // 成功后定时器已释放：计时器计数归零，快进 30 秒不再有遗留 abort。
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS)
  })

  it('外层取消后同样释放定时器与监听', async () => {
    vi.stubGlobal('fetch', stubFetchHanging())
    const controller = new AbortController()
    const pending = realTransport.request(request, controller.signal)
    pending.catch(() => {})
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('失败（网络拒绝）后释放定时器', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(realTransport.request(request)).rejects.toThrow(TransportError)
    expect(vi.getTimerCount()).toBe(0)
  })
})
