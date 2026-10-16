import type { RouteLocationRaw } from 'vue-router'
import type { TargetDTO } from '../../api/notices'
import { isUuid } from '../assignments/format'

/**
 * 把消息/公告的跳转目标映射成站内路由。
 * - 返回 null：不可跳转（help_request 属 P2、id 或 offeringId 不是 UUID）。
 * - 返回 'needs-feedback-lookup'：feedback 需先 getFeedback(id) 取 assignmentId，再跳作业详情。
 * 只返回命名路由对象，不拼接字符串 URL。
 */
export function targetRoute(target: TargetDTO): RouteLocationRaw | 'needs-feedback-lookup' | null {
  if (!isUuid(target.id) || !isUuid(target.offeringId)) return null
  switch (target.type) {
    case 'offering': return { name: 'course', params: { offeringId: target.id } }
    case 'chapter': return { name: 'chapter', params: { offeringId: target.offeringId, chapterId: target.id } }
    case 'resource': return { name: 'resource', params: { resourceId: target.id } }
    case 'assignment': return { name: 'student-assignment', params: { id: target.id } }
    case 'feedback': return 'needs-feedback-lookup'
    default: return null
  }
}
