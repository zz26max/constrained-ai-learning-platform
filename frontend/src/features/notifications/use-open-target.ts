import { shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { assignmentsApi } from '../../api'
import type { TargetDTO } from '../../api/notices'
import { pageError, type PageError } from '../courses/page-error'
import { targetRoute } from './target-route'

/** 首页公告摘要与公告详情共用的目标跳转；不改变任何已读状态。 */
export function useOpenTarget() {
  const router = useRouter()
  const error = shallowRef<PageError | null>(null)

  function canOpen(target: TargetDTO | null): target is TargetDTO {
    return target !== null && targetRoute(target) !== null
  }

  async function open(target: TargetDTO): Promise<void> {
    const route = targetRoute(target)
    if (route === null) return
    error.value = null
    try {
      if (route === 'needs-feedback-lookup') {
        const feedback = await assignmentsApi().getFeedback(target.id)
        await router.push({ name: 'student-assignment', params: { id: feedback.data.assignmentId }, query: { feedbackId: target.id } })
      } else {
        await router.push(route)
      }
    } catch (cause) {
      const failure = await pageError(cause)
      error.value = failure.kind === 'not-found' || failure.kind === 'forbidden'
        ? { ...failure, message: '该内容已不可访问' }
        : failure
    }
  }

  return { error, canOpen, open }
}
