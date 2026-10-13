import type { Transport, TransportRequest, TransportResponse } from '../src/api/transport'
import { TransportError } from '../src/api/client'

/** 脚本化传输层：按 operationId 回放预置响应，并记录全部请求供断言。 */

export interface ScriptedResponse {
  status: number
  body: unknown
  headers?: Record<string, string | string[]>
}

export type ScriptHandler = (request: TransportRequest) => ScriptedResponse | Promise<ScriptedResponse>

export interface ScriptedTransport {
  transport: Transport
  requests: TransportRequest[]
  setHandler(handler: ScriptHandler): void
}

export function createScriptedTransport(): ScriptedTransport {
  const requests: TransportRequest[] = []
  let handler: ScriptHandler | null = null
  const transport: Transport = {
    async request(request: TransportRequest, signal?: AbortSignal): Promise<TransportResponse> {
      signal?.throwIfAborted()
      requests.push(request)
      if (handler === null) {
        throw new TransportError('脚本化传输层未设置响应。')
      }
      const scripted = await handler(request)
      return {
        status: scripted.status,
        headers: { 'content-type': 'application/json', ...(scripted.headers ?? {}) },
        bodyText: JSON.stringify(scripted.body),
      }
    },
  }
  return {
    transport,
    requests,
    setHandler(next: ScriptHandler): void {
      handler = next
    },
  }
}

export function okEnvelope(data: unknown, requestId = 'req-ok'): ScriptedResponse {
  return { status: 200, body: { data, requestId } }
}

export function failEnvelope(
  status: number,
  code: string,
  details: Record<string, unknown> = {},
  requestId = 'req-err',
): ScriptedResponse {
  return { status, body: { error: { code, message: '错误', details }, requestId } }
}

export const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'student.demo',
  displayName: '演示学生',
  roles: ['student'],
} as const

export const DEMO_CONFIG = {
  apiVersion: 'v1',
  serverTime: '2026-10-11T02:00:00Z',
  timezone: 'Asia/Shanghai',
  currentTermId: null,
  terms: [],
  features: { aiTutoring: false, learningAnalytics: false, serverChecks: false },
} as const

export function operationIds(requests: readonly TransportRequest[]): string[] {
  return requests.map((item) => item.operationId)
}
