import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { ApiResult } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import { pageError, type PageError } from './page-error'

/** 用户显式写操作。取消页面不会重放写请求，也不会让迟到结果恢复旧页面。 */
export function useCourseActions() {
  const auth = useAuthStore(), route = useRoute()
  const pending = ref(false)
  const error = shallowRef<PageError | null>(null)
  const message = ref<string | null>(null)
  let generation = 0, alive = true
  watch([() => route.fullPath, () => auth.identity?.id], () => {
    generation += 1; pending.value = false; error.value = null; message.value = null
  }, { flush: 'sync' })
  onScopeDispose(() => { alive = false; generation += 1 })

  function clearNotice(): void {
    error.value = null
    message.value = null
  }

  async function run<T>(operation: (token: string) => Promise<ApiResult<T>>, successMessage = '操作已完成'): Promise<T | null> {
    if (pending.value) return null
    const current = ++generation, userId = auth.identity?.id
    pending.value = true; error.value = null; message.value = null
    try {
      const token = await auth.ensureCsrfToken()
      const result = await operation(token)
      if (!alive || current !== generation || auth.identity?.id !== userId) return null
      auth.markActionSucceeded()
      message.value = successMessage
      return result.data
    } catch (cause) {
      if (!alive || current !== generation || auth.identity?.id !== userId) return null
      const failure = await pageError(cause)
      if (alive && current === generation) error.value = failure
      return null
    } finally {
      if (alive && current === generation) pending.value = false
    }
  }
  return { pending, error, message, clearNotice, run }
}
