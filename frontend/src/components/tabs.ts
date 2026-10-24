/**
 * ARIA tabs 键盘模式（WAI-ARIA APG）：roving tabindex，方向键/Home/End 激活并聚焦目标 tab。
 * 只负责键盘与焦点语义，视觉与数据由调用方控制；tab 顺序取自 tablist 的真实 DOM 顺序。
 */
export function onTablistKeydown(event: KeyboardEvent, activate: (index: number) => void): void {
  const tab = event.target as HTMLElement | null
  if (!tab || tab.getAttribute('role') !== 'tab') return
  const tabs = Array.from(tab.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
  const index = tabs.indexOf(tab)
  if (index < 0) return
  let next = -1
  switch (event.key) {
    case 'ArrowRight': next = (index + 1) % tabs.length; break
    case 'ArrowLeft': next = (index - 1 + tabs.length) % tabs.length; break
    case 'Home': next = 0; break
    case 'End': next = tabs.length - 1; break
    default: return
  }
  event.preventDefault()
  tabs[next]?.focus()
  activate(next)
}
