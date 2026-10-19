import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type ComputedRef } from 'vue'
import type { NotificationDTO } from '../../api/assignments'

/** Measure rendered clipping, rather than guessing from character count. */
export function useMessageOverflow(notifications: ComputedRef<NotificationDTO[]>) {
  const listElement = ref<HTMLUListElement | null>(null)
  const clippedIds = shallowRef(new Set<string>())
  let observer: ResizeObserver | undefined
  let frame = 0
  let disposed = false
  function measureOverflow() {
    const next = new Set<string>()
    for (const row of listElement.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []) {
      const id = row.dataset.messageId
      if (!id) continue
      // Expanded text is not clamped; retain its control until it is closed.
      if (row.querySelector<HTMLDetailsElement>('details')?.open) { next.add(id); continue }
      const clipped = [...row.querySelectorAll<HTMLElement>('.notification-title,.notification-content')]
        .some(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
      if (clipped) next.add(id)
    }
    if (next.size !== clippedIds.value.size || [...next].some(id => !clippedIds.value.has(id))) clippedIds.value = next
  }
  function schedule() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { if (!disposed) measureOverflow() })
  }
  watch([notifications, listElement], async () => {
    await nextTick()
    if (disposed) return
    observer?.disconnect()
    if (listElement.value) observer?.observe(listElement.value)
    measureOverflow()
  }, { flush: 'post' })
  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(schedule)
    if (listElement.value) observer?.observe(listElement.value)
    window.addEventListener('resize', schedule)
    document.fonts?.addEventListener('loadingdone', schedule)
    schedule()
  })
  onBeforeUnmount(() => {
    disposed = true
    observer?.disconnect()
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', schedule)
    document.fonts?.removeEventListener('loadingdone', schedule)
  })
  return { listElement, clippedIds, measureOverflow: schedule }
}
