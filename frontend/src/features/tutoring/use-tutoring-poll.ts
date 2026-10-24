import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { tutoringApi } from '../../api'
import type { TutoringRequestDTO } from '../../api/tutoring'

export type PollState = 'idle' | 'polling' | 'done' | 'error'

const START_DELAY_MS = 1000
const MAX_DELAY_MS = 5000

export function isTerminalStatus(status: TutoringRequestDTO['status']): boolean {
  return status === 'completed' || status === 'fallback' || status === 'failed'
}

/**
 * P2 AI 请求轮询（FRONTEND §6）：1s 起步、逐次翻倍退避至 5s；
 * 终态即停，组件卸载即停；重进页面由调用方用 pendingRequestId 重新 poll 恢复。
 */
export function useTutoringPoll() {
  const request = shallowRef<TutoringRequestDTO | null>(null)
  const state = ref<PollState>('idle')
  let requestId: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let delay = START_DELAY_MS
  let generation = 0

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function tick(): Promise<void> {
    if (requestId === null) return
    const current = ++generation
    try {
      const result = await tutoringApi().getTutoringRequest(requestId)
      if (current !== generation) return
      request.value = result.data
      if (isTerminalStatus(result.data.status)) {
        state.value = 'done'
        clearTimer()
        return
      }
      schedule()
    } catch {
      if (current !== generation) return
      state.value = 'error'
      clearTimer()
    }
  }

  function schedule(): void {
    clearTimer()
    timer = setTimeout(() => { void tick() }, delay)
    delay = Math.min(delay * 2, MAX_DELAY_MS)
  }

  function poll(id: string): void {
    generation++
    clearTimer()
    requestId = id
    delay = START_DELAY_MS
    state.value = 'polling'
    schedule()
  }

  function stop(): void {
    generation++
    clearTimer()
    requestId = null
    state.value = 'idle'
  }

  onBeforeUnmount(stop)

  return { request, state, poll, stop }
}
