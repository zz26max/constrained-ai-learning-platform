import type { Transport, TransportRequest, TransportResponse } from './transport'
import { TransportError } from './client'

/** 单次 HTTP 请求的本地截止时间：约束连接建立与响应 body 读取，
    不约束 AI 异步任务总时长（那些请求本身 202 即返回）。 */
export const REQUEST_DEADLINE_MS = 30_000

interface DeadlineHandle {
  controller: AbortController
  /** 截止时间是否已触发（外层主动取消不算）。 */
  deadlineFired: boolean
  release(): void
}

/** 合并外部 signal 与本地截止时间。手工组合而非 AbortSignal.any：
    行为在目标浏览器间一致，且定时器随 fake timers 完全可测。
    成功/失败/取消后必须调用 release() 释放定时器与监听。 */
function withDeadline(signal: AbortSignal | undefined, deadlineMs: number): DeadlineHandle {
  const controller = new AbortController()
  const handle: DeadlineHandle = { controller, deadlineFired: false, release: () => {} }
  const abortFromOuter = () => controller.abort(signal?.reason)
  if (signal !== undefined) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', abortFromOuter, { once: true })
  }
  const timer = setTimeout(() => {
    handle.deadlineFired = true
    controller.abort(new DOMException('deadline', 'TimeoutError'))
  }, deadlineMs)
  handle.release = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromOuter)
  }
  return handle
}

/** 同源 Cookie 传输（FRONTEND.md 2/3）：credentials include，保留状态码与多条 Set-Cookie。
    外层 signal（路由切换、账号变化）保持取消语义抛 AbortError；本地截止时间作为
    可展示的传输错误（TransportError），不发明后端业务错误码，也不自动重试写请求。 */
export const realTransport: Transport = {
  async request(
    request: TransportRequest,
    signal?: AbortSignal,
  ): Promise<TransportResponse> {
    const deadline = withDeadline(signal, REQUEST_DEADLINE_MS)
    try {
      let response: Response
      try {
        response = await fetch(request.path, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          credentials: 'include',
          cache: 'no-store',
          signal: deadline.controller.signal,
        })
      } catch (error) {
        if (signal?.aborted === true) throw error
        if (deadline.deadlineFired) {
          throw new TransportError(`请求超时：超过 ${REQUEST_DEADLINE_MS / 1000} 秒未完成，请检查网络后重试。`)
        }
        throw new TransportError()
      }
      const headers: Record<string, string | string[]> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })
      const setCookies = response.headers.getSetCookie()
      if (setCookies.length > 0) {
        const existing = headers['set-cookie']
        const previous = Array.isArray(existing) ? existing : existing === undefined ? [] : [existing]
        headers['set-cookie'] = [...previous, ...setCookies]
      }
      let bodyText: string
      try {
        bodyText = await response.text()
      } catch (error) {
        if (signal?.aborted === true) throw error
        if (deadline.deadlineFired) {
          throw new TransportError(`请求超时：超过 ${REQUEST_DEADLINE_MS / 1000} 秒未完成，请检查网络后重试。`)
        }
        throw new TransportError()
      }
      return { status: response.status, headers, bodyText }
    } finally {
      deadline.release()
    }
  },
}
