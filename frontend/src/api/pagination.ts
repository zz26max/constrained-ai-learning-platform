/** Aggregate a complete existing paginated query. Partial results never imply completeness. */
export async function allPages<T>(load: (page: number, pageSize: number, signal: AbortSignal) => Promise<{items: T[]; total: number}>, signal: AbortSignal): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page++) {
    signal.throwIfAborted()
    const result = await load(page, 100, signal)
    signal.throwIfAborted()
    items.push(...result.items)
    if (items.length >= result.total) return items
    if (!result.items.length) throw new Error('分页数据已变化，未能完整读取，请重试。')
  }
}
