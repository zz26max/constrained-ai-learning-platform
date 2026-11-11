import { describe, expect, it } from 'vitest'
import { INDENT, indent, newline, outdent } from '../src/features/assignments/editor-text'

/** 用 ^ 标记光标/选区端点，便于把期望写成可读字符串；没有 ^ 时视为整段选中。 */
function caret(text: string): { value: string; start: number; end: number } {
  if (!text.includes('^')) return { value: text, start: 0, end: text.length }
  const start = text.indexOf('^')
  const withoutFirst = text.slice(0, start) + text.slice(start + 1)
  const end = withoutFirst.indexOf('^')
  const value = withoutFirst.replace('^', '')
  return { value, start, end: end < 0 ? start : end }
}

describe('Tab 缩进', () => {
  it('无选区时在光标处插入一级缩进', () => {
    const { value, start, end } = caret('<div>^</div>')
    const edit = indent(value, start, end)
    expect(edit.value).toBe(`<div>${INDENT}</div>`)
    expect(edit.start).toBe(start + INDENT.length)
    expect(edit.end).toBe(edit.start)
  })

  it('选中两行时每行各加一级，选区随行数扩张', () => {
    const { value, start, end } = caret('^<p>a</p>\n<span>b</span>^')
    const edit = indent(value, start, end)
    expect(edit.value).toBe(`${INDENT}<p>a</p>\n${INDENT}<span>b</span>`)
    expect(edit.value.slice(edit.start, edit.end)).toBe(`<p>a</p>\n${INDENT}<span>b</span>`)
  })

  it('选区停在下一行行首时不多缩进那一行', () => {
    const { value, start, end } = caret('^<p>a</p>^\n<span>b</span>')
    const edit = indent(value, start, end)
    expect(edit.value).toBe(`${INDENT}<p>a</p>\n<span>b</span>`)
  })
})

describe('Shift+Tab 反缩进', () => {
  it('整块都没有前导空格时原样返回', () => {
    const { value, start, end } = caret('<p>a</p>\n<span>b</span>')
    const edit = outdent(value, 0, value.length)
    expect(edit).toEqual({ value, start, end })
  })

  it('按行去掉最多一级缩进，选区随之收缩', () => {
    const { value, start, end } = caret('^    <p>a</p>\n    <span>b</span>^')
    const edit = outdent(value, start, end)
    expect(edit.value).toBe(`${INDENT}<p>a</p>\n${INDENT}<span>b</span>`)
  })

  it('无选区时只把光标回到行首一级以内', () => {
    const { value, start } = caret('    <p>^a</p>')
    const edit = outdent(value, start, start)
    expect(edit.value).toBe(`${INDENT}<p>a</p>`)
    expect(edit.start).toBe(start - INDENT.length)
    expect(edit.end).toBe(edit.start)
  })
})

describe('回车继承缩进', () => {
  it('保留当前行缩进', () => {
    const { value, start } = caret(`${INDENT}<div>^</div>`)
    const edit = newline(value, start)
    expect(edit.value).toBe(`${INDENT}<div>\n${INDENT}</div>`)
    expect(edit.start).toBe(start + 1 + INDENT.length)
  })

  it('行尾是开括号时多缩进一级', () => {
    const { value, start } = caret(`body {^}`)
    const edit = newline(value, start)
    expect(edit.value).toBe(`body {\n${INDENT}}`)
  })

  it('有选区时整段替换为换行', () => {
    const { value, start, end } = caret('a^bc^d')
    const edit = newline(value, start, end)
    expect(edit.value).toBe('a\nd')
    expect(edit.start).toBe(2)
  })
})
