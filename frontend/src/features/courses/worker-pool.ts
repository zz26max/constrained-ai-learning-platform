/** 有界并发执行器（F6）：固定数量 worker 按加入顺序消费任务，结果按任务下标回填，
    顺序确定；signal 中止时停止派发新任务（在途请求由调用方的 signal 取消）。
    单任务失败不在工具内吞掉：由任务函数自行降级，或让异常向外传播由页面统一处理。 */
export async function runBounded<T>(tasks: readonly (() => Promise<T>)[], concurrency: number, signal?: AbortSignal): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      signal?.throwIfAborted()
      const index = cursor++
      results[index] = await tasks[index]!()
    }
  })
  await Promise.all(workers)
  return results
}
