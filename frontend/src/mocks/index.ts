import type { Transport, TransportRequest, TransportResponse } from '../api/transport'
import { authHandlers, resetMockAuthState } from './auth'
import { courseHandlers, resetMockCourseState } from './courses'
import { assignmentHandlers, resetMockAssignmentState } from './assignments'
import { feedbackHandlers, resetMockFeedbackState } from './feedback'
import { dashboardHandlers, resetMockDashboardState } from './dashboard'
import { tutoringHandlers, resetMockTutoringState } from './tutoring'
import { applySetCookies, currentCookies, resetMockCookies } from './jar'
import { MockNotImplementedError, toTransportResponse, type MockHandler } from './types'

/** 构建产物扫描哨兵：scripts/check-no-mock.mjs 检查 dist 不含该标记。 */
export const MOCK_LAYER_MARKER = 'MOCK_LAYER_ACTIVE'
void MOCK_LAYER_MARKER

const handlers: Record<string, MockHandler> = {
  ...authHandlers,
  ...courseHandlers,
  ...assignmentHandlers,
  ...feedbackHandlers,
  ...dashboardHandlers,
  ...tutoringHandlers,
}

function findHandler(operationId: string): MockHandler | undefined {
  return handlers[operationId]
}

/**
 * mock 传输层：按 operationId 路由到 src/mocks 的处理器；
 * 未实现的操作显式失败（MockNotImplementedError），绝不回退真实请求。
 */
export const mockTransport: Transport = {
  async request(
    request: TransportRequest,
    signal?: AbortSignal,
  ): Promise<TransportResponse> {
    signal?.throwIfAborted()
    const handler = findHandler(request.operationId)
    if (handler === undefined) {
      throw new MockNotImplementedError(request.operationId)
    }
    let bodyJson: unknown
    if (request.body !== undefined) {
      try {
        bodyJson = JSON.parse(request.body)
      } catch {
        bodyJson = null
      }
    }
    const result = handler({ ...request, cookies: currentCookies(), bodyJson })
    applySetCookies(result.setCookies)
    const response = toTransportResponse(result)
    response.headers['cache-control'] = 'no-store'
    if (result.bodyJson !== null && typeof result.bodyJson === 'object' && 'requestId' in result.bodyJson && typeof result.bodyJson.requestId === 'string') {
      response.headers['x-request-id'] = result.bodyJson.requestId
    }
    return response
  },
}

export { resetMockAuthState, resetMockCookies, resetMockCourseState, resetMockAssignmentState, resetMockFeedbackState, resetMockDashboardState, resetMockTutoringState }
