import type { TransportRequest, TransportResponse } from '../api/transport'

/** mock 请求上下文：在传输请求之上附上当前 Cookie 与已解析正文。 */
export interface MockRequestContext extends TransportRequest {
  cookies: Readonly<Record<string, string>>
  bodyJson: unknown
}

/** mock 处理结果：响应信封正文 + 需要设置的 Cookie（模拟 HttpOnly Cookie 行为）。 */
export interface MockResult {
  status: number
  bodyJson: unknown
  setCookies?: string[]
}

export type MockHandler = (context: MockRequestContext) => MockResult

/** mock 模式未实现该操作：显式失败，绝不转发真实请求（FRONTEND.md 1.1）。 */
export class MockNotImplementedError extends Error {
  constructor(operationId: string) {
    super(`模拟模式未实现操作 ${operationId}；不转发真实请求。`)
    this.name = 'MockNotImplementedError'
  }
}

export function toTransportResponse(result: MockResult): TransportResponse {
  const headers: Record<string, string | string[]> = {
    'content-type': 'application/json',
  }
  if (result.setCookies !== undefined && result.setCookies.length > 0) {
    headers['set-cookie'] = result.setCookies
  }
  return {
    status: result.status,
    headers,
    bodyText: JSON.stringify(result.bodyJson),
  }
}
