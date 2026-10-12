/**
 * CSRF 恢复协调器（DEVELOPMENT.md 10.2 第 2 条）：
 * 同一用户代次中的并发 CSRF 失败只共用一次进行中的令牌刷新；
 * 每轮恢复自动获取 CSRF 最多一次，不循环刷新。
 */
export interface CsrfRefreshCoordinator {
  recover(): Promise<void>
}

export function createCsrfRefreshCoordinator(
  refresh: () => Promise<void>,
  currentGeneration: () => number,
): CsrfRefreshCoordinator {
  let inFlight: { promise: Promise<void>; generation: number } | null = null
  return {
    async recover(): Promise<void> {
      const generation = currentGeneration()
      if (inFlight !== null && inFlight.generation === generation) {
        // 并发失败共用同一次进行中的刷新；共享方吞掉共享错误，由首个发起方决定结果。
        await inFlight.promise.catch(() => {})
        return
      }
      const promise = refresh()
      inFlight = { promise, generation }
      try {
        await promise
      } finally {
        if (inFlight !== null && inFlight.promise === promise) {
          inFlight = null
        }
      }
    },
  }
}
