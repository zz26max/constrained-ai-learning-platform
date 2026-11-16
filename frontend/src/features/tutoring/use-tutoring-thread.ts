import { computed, shallowRef, watch, type Ref } from 'vue'
import { tutoringApi } from '../../api'
import type { TutoringMessagePage } from '../../api/tutoring'
import { usePageQuery } from '../courses/use-page-query'

const PAGE_SIZE = 50

function lastPage(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

async function readPage(sessionId: string | null, page: number, signal: AbortSignal): Promise<TutoringMessagePage> {
  if (sessionId === null) throw new Error('尚未选择辅导会话。')
  signal.throwIfAborted()
  return (await tutoringApi().listTutoringMessages(sessionId, { page, pageSize: PAGE_SIZE }, { signal })).data
}

export function useTutoringThread(sessionId: Readonly<Ref<string | null>>) {
  const pages = shallowRef<TutoringMessagePage[]>([])
  const latest = usePageQuery(async signal => {
    const id = sessionId.value
    const previousTail = pages.value.at(-1)

    // 消息按序号升序分页。首读通过 total 定位尾页，保留相邻一页的上下文。
    const anchor = await readPage(id, previousTail?.page ?? 1, signal)
    let total = anchor.total
    const hasPrevious = previousTail && anchor.page <= lastPage(total)
    const start = hasPrevious ? anchor.page : Math.max(1, lastPage(total) - 1)
    const results: TutoringMessagePage[] = []
    for (let page = start; page <= lastPage(total); page += 1) {
      const result = page === anchor.page ? anchor : await readPage(id, page, signal)
      results.push(result)
      total = result.total
    }
    return results
  })

  // 翻阅历史和收到回复可以同时发生。分别读取，在同一会话内按页合并。
  const earlier = usePageQuery(signal => readPage(sessionId.value, (pages.value[0]?.page ?? 2) - 1, signal))
  const messages = computed(() => pages.value.flatMap(page => page.items))
  const hasEarlier = computed(() => (pages.value[0]?.page ?? 1) > 1)

  function merge(incoming: TutoringMessagePage[]): void {
    const merged = new Map(pages.value.map(page => [page.page, page]))
    for (const page of incoming) merged.set(page.page, page)
    pages.value = [...merged.values()].sort((a, b) => a.page - b.page)
  }

  function loadEarlier(): void {
    if (hasEarlier.value && earlier.status.value !== 'loading') void earlier.load()
  }

  watch(latest.data, data => { if (data) merge(data) }, { flush: 'sync' })
  watch(earlier.data, data => { if (data) merge([data]) }, { flush: 'sync' })
  watch(sessionId, id => {
    latest.clear()
    earlier.clear()
    pages.value = []
    if (id !== null) void latest.load()
  }, { flush: 'sync' })

  return {
    messages, hasEarlier, status: latest.status, error: latest.error, refresh: latest.load,
    earlierStatus: earlier.status, earlierError: earlier.error, loadEarlier,
  }
}
