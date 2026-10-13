/** 并发 CSRF 失败共享进行中的恢复；成功和失败都传给每个调用方。 */
export interface CsrfRefreshCoordinator {
  recover(): Promise<void>
}

export function createCsrfRefreshCoordinator(
  refresh: () => Promise<void>,
): CsrfRefreshCoordinator {
  let inFlight: Promise<void> | null = null
  return {
    recover(): Promise<void> {
      if (inFlight === null) {
        inFlight = Promise.resolve().then(refresh).finally(() => { inFlight = null })
      }
      return inFlight
    },
  }
}
