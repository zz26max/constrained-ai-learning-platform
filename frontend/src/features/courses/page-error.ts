import { ApiError } from '../../api/client'
import { useAuthStore } from '../../stores/auth'

export interface PageError {
  kind: 'not-found' | 'forbidden' | 'csrf' | 'session' | 'failure'
  message: string
  requestId: string | null
}

export async function pageError(error: unknown): Promise<PageError> {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      await useAuthStore().recoverIdentity(error.requestId)
      return { kind: 'session', message: '登录身份需要重新确认，请重新登录或重试。', requestId: error.requestId }
    }
    if (error.status === 403 && error.code === 'CSRF_INVALID') {
      const message = await useAuthStore().recoverCsrfFailure(error.requestId)
      return { kind: 'csrf', message, requestId: error.requestId }
    }
    if (error.status === 404) {
      return { kind: 'not-found', message: '内容不存在或无权访问，请返回列表重新选择。', requestId: error.requestId }
    }
    if (error.status === 403 && error.code === 'FORBIDDEN') {
      return { kind: 'forbidden', message: '没有执行此操作的权限。', requestId: error.requestId }
    }
    if (error.code === 'INVALID_INVITE_CODE') {
      return { kind: 'failure', message: '邀请码不可用，请向教师确认。', requestId: error.requestId }
    }
    return { kind: 'failure', message: error.message, requestId: error.requestId }
  }
  return { kind: 'failure', message: error instanceof Error ? error.message : '请求失败，请重试。', requestId: null }
}
