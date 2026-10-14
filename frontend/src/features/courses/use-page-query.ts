import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useAuthStore, type RequestPhase } from '../../stores/auth'
import { pageError, type PageError } from './page-error'

/** 页面/筛选请求的代次，和认证令牌无关；取消后仍检查代次及真实 userId。 */
export function usePageQuery<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const auth = useAuthStore()
  const data = shallowRef<T | null>(null)
  const status = ref<RequestPhase>('idle')
  const error = shallowRef<PageError | null>(null)
  let generation = 0
  let controller: AbortController | null = null
  const invalidate = () => { generation += 1; controller?.abort(); controller = null }

  async function load(): Promise<void> {
    invalidate()
    const current = generation, userId = auth.identity?.id
    controller = new AbortController()
    const signal = controller.signal
    data.value = null
    error.value = null
    status.value = 'loading'
    try {
      const result = await loader(signal)
      if (current !== generation || signal.aborted || auth.identity?.id !== userId) return
      data.value = result
      status.value = 'success'
    } catch (cause) {
      if (current !== generation || signal.aborted || auth.identity?.id !== userId) return
      const failure = await pageError(cause)
      if (current !== generation || signal.aborted) return
      error.value = failure
      status.value = 'error'
    }
  }
  watch(() => auth.identity?.id, () => {
    invalidate(); data.value = null; error.value = null; status.value = 'idle'
  }, { flush: 'sync' })
  onScopeDispose(invalidate)
  return { data, status, error, load }
}
