import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onTablistKeydown } from '../src/components/tabs'

/** 构建 tablist DOM：div[role=tablist] > button[role=tab]*n，返回按钮数组。 */
function buildTabs(count: number): HTMLButtonElement[] {
  const list = document.createElement('div')
  list.setAttribute('role', 'tablist')
  const buttons = Array.from({ length: count }, () => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'tab')
    list.appendChild(button)
    return button
  })
  document.body.appendChild(list)
  return buttons
}

function press(el: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}

/** 模拟组件中的 @keydown 绑定：每个 tab 把键盘事件交给 onTablistKeydown。 */
function bind(buttons: HTMLButtonElement[], activate: (index: number) => void): void {
  for (const button of buttons) {
    button.addEventListener('keydown', event => onTablistKeydown(event, activate))
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('ARIA tabs 键盘模式', () => {
  it('ArrowRight 循环激活并聚焦下一个 tab', () => {
    const buttons = buildTabs(3)
    const a = buttons[0]!, b = buttons[1]!, c = buttons[2]!
    const activate = vi.fn()
    bind(buttons, activate)
    b.focus()
    const event = press(b, 'ArrowRight')
    expect(event.defaultPrevented).toBe(true)
    expect(activate).toHaveBeenCalledWith(2)
    expect(document.activeElement).toBe(c)
    press(c, 'ArrowRight')
    expect(activate).toHaveBeenLastCalledWith(0)
    expect(document.activeElement).toBe(a)
  })

  it('ArrowLeft、Home、End 遵循 WAI-ARIA APG', () => {
    const buttons = buildTabs(3)
    const a = buttons[0]!, c = buttons[2]!
    const activate = vi.fn()
    bind(buttons, activate)
    a.focus()
    press(a, 'ArrowLeft')
    expect(activate).toHaveBeenLastCalledWith(2)
    press(a, 'Home')
    expect(activate).toHaveBeenLastCalledWith(0)
    c.focus()
    press(c, 'End')
    expect(activate).toHaveBeenLastCalledWith(2)
    expect(activate).toHaveBeenCalledTimes(3)
  })

  it('非方向键不拦截、不激活；非 tab 目标忽略', () => {
    const buttons = buildTabs(2)
    const a = buttons[0]!
    const activate = vi.fn()
    bind(buttons, activate)
    a.focus()
    const enter = press(a, 'Enter')
    expect(enter.defaultPrevented).toBe(false)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    press(outside, 'ArrowRight')
    expect(activate).not.toHaveBeenCalled()
  })
})
