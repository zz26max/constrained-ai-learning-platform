import type { Transport, TransportRequest, TransportResponse } from './transport'
import { TransportError } from './client'

/** 同源 Cookie 传输（FRONTEND.md 2/3）：credentials include，保留状态码与多条 Set-Cookie。 */
export const realTransport: Transport = {
  async request(
    request: TransportRequest,
    signal?: AbortSignal,
  ): Promise<TransportResponse> {
    let response: Response
    try {
      response = await fetch(request.path, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
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
    const bodyText = await response.text()
    return { status: response.status, headers, bodyText }
  },
}
