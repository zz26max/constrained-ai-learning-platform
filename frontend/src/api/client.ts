import type { ApiMethod, Transport, TransportResponse } from './transport'

/** 后端按契约返回的结构化错误；code 为契约登记的错误码，网络层失败没有 code。 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly errorDetails: unknown
  readonly requestId: string | null
  readonly retryAfterSeconds: number | null

  constructor(init: {
    status: number
    code: string | null
    message: string
    errorDetails?: unknown
    requestId: string | null
    retryAfterSeconds?: number | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.errorDetails = init.errorDetails
    this.requestId = init.requestId
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
  }
}

/** 网络层失败（连接失败、响应不可解析）。不携带契约错误码，不伪装成空数据。 */
export class TransportError extends Error {
  constructor(message = '网络连接失败，请稍后重试。') {
    super(message)
    this.name = 'TransportError'
  }
}

export interface ApiResult<T> {
  data: T
  requestId: string | null
}

export interface OperationSpec {
  id: string
  method: ApiMethod
  path: string
  /** 是否要求 X-CSRF-Token。契约中每个操作的 x-csrf-required 已核对。 */
  csrf: boolean
}

export interface RequestOptions {
  body?: unknown
  csrfToken?: string
  query?: Record<string, string>
  signal?: AbortSignal
  /** fetch keepalive：仅学习事件上报的退出冲刷使用（页面卸载窗口保送），默认不开启。 */
  keepalive?: boolean
}

interface EnvelopeOk<T> {
  data: T
  requestId?: string
}

interface EnvelopeFailure {
  error?: { code?: string; message?: string; details?: unknown }
  requestId?: string
}

function firstHeader(response: TransportResponse, name: string): string | null {
  const value = response.headers[name]
  if (value === undefined) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * 统一请求层（FRONTEND.md 2）：
 * 只解包一次 data；错误保持结构化信息；网络失败不转成空数组或空对象；
 * 不自动重试任何写请求。
 */
export class ApiClient {
  constructor(private readonly transport: Transport) {}

  async request<T>(spec: OperationSpec, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    const sentRequestId = crypto.randomUUID()
    headers['X-Request-ID'] = sentRequestId
    let body: string | undefined
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }
    if (spec.csrf) {
      if (options.csrfToken === undefined || options.csrfToken === '') {
        throw new TransportError(`操作 ${spec.id} 需要 CSRF 令牌，调用方未提供。`)
      }
      headers['X-CSRF-Token'] = options.csrfToken
    }
    let path = spec.path
    if (options.query !== undefined) {
      const query = new URLSearchParams(options.query).toString()
      if (query !== '') path = `${path}?${query}`
    }
    const response = await this.transport.request(
      {
        operationId: spec.id, method: spec.method, path, headers, body,
        ...(options.keepalive === true ? { keepalive: true } : {}),
      },
      options.signal,
    )
    return this.unwrap<T>(spec, response, sentRequestId)
  }

  private unwrap<T>(
    spec: OperationSpec,
    response: TransportResponse,
    sentRequestId: string,
  ): ApiResult<T> {
    let parsed: unknown
    try {
      parsed = JSON.parse(response.bodyText)
    } catch {
      throw new TransportError(
        `操作 ${spec.id} 的响应不是合法 JSON（HTTP ${response.status}）。`,
      )
    }
    if (parsed === null || typeof parsed !== 'object') {
      throw new TransportError(`操作 ${spec.id} 的响应结构不合法（HTTP ${response.status}）。`)
    }
    if (response.status >= 200 && response.status < 300) {
      const envelope = parsed as EnvelopeOk<unknown>
      if (!('data' in envelope)) {
        throw new TransportError(`操作 ${spec.id} 的成功响应缺少 data 字段。`)
      }
      return {
        data: envelope.data as T,
        requestId:
          envelope.requestId ??
          firstHeader(response, 'x-request-id') ??
          sentRequestId ??
          null,
      }
    }
    const failure = parsed as EnvelopeFailure
    const error = failure.error
    const retryAfterRaw = firstHeader(response, 'retry-after')
    throw new ApiError({
      status: response.status,
      code: typeof error?.code === 'string' ? error.code : null,
      message: typeof error?.message === 'string' ? error.message : '请求失败。',
      errorDetails: error?.details,
      requestId:
        failure.requestId ?? firstHeader(response, 'x-request-id') ?? sentRequestId ?? null,
      retryAfterSeconds:
        retryAfterRaw !== null && /^\d+$/.test(retryAfterRaw) ? Number(retryAfterRaw) : null,
    })
  }
}
