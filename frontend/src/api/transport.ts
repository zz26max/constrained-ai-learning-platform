/** 传输层抽象：真实 fetch 与 mock 层实现同一接口，页面不直接区分模式。 */

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface TransportRequest {
  /** 契约 operationId；mock 层按其路由，真实传输按 path 请求。 */
  operationId: string
  method: ApiMethod
  /** 同源绝对路径，如 /api/v1/auth/login。 */
  path: string
  headers: Record<string, string>
  /** 已序列化的 JSON 请求正文；GET 时为空。 */
  body?: string
  /** 是否以 fetch keepalive 发送：仅学习事件上传的退出冲刷使用，其他路径不得开启。 */
  keepalive?: boolean
}

export interface TransportResponse {
  status: number
  /** 已解析的响应头（小写键）；Set-Cookie 以数组形式保留多条。 */
  headers: Record<string, string | string[]>
  bodyText: string
}

export interface Transport {
  request(request: TransportRequest, signal?: AbortSignal): Promise<TransportResponse>
}
