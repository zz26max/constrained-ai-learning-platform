/**
 * 工作区编辑器的纯文本操作：缩进、反缩进、回车继承缩进。
 *
 * 只做字符串与光标偏移计算，不触碰 DOM，便于单测；调用方负责把结果写回
 * `fileContents`，并在下一个 tick 恢复选区。缩进宽度与样式表的 `tab-size: 2` 一致。
 */
export const INDENT = '  '

export interface TextEdit {
  value: string
  start: number
  end: number
}

function lineStartOf(value: string, offset: number): number {
  const index = value.lastIndexOf('\n', offset - 1)
  return index < 0 ? 0 : index + 1
}

/** 选中范围涉及的行块：末行按「光标前一个字符所在行」计算，避免多缩进/反缩进一个空行。 */
function lineBlock(value: string, start: number, end: number): { from: number; to: number } {
  const from = lineStartOf(value, start)
  const lastOffset = Math.max(start, end - 1)
  const lastBreak = value.indexOf('\n', lastOffset)
  return { from, to: lastBreak < 0 ? value.length : lastBreak }
}

/** Tab：无选区时在光标处插入一级缩进；有选区时给涉及的每一行加一级缩进。 */
export function indent(value: string, start: number, end: number): TextEdit {
  const { from, to } = lineBlock(value, start, end)
  if (start === end || from === to) {
    return {
      value: value.slice(0, start) + INDENT + value.slice(start),
      start: start + INDENT.length,
      end: end + INDENT.length,
    }
  }
  const lines = value.slice(from, to).split('\n')
  return {
    value: value.slice(0, from) + lines.map(line => INDENT + line).join('\n') + value.slice(to),
    start: start + INDENT.length,
    end: end + INDENT.length * lines.length,
  }
}

/** Shift+Tab：去掉每行最多一级的前导空格；整块都没有前导空格时原样返回。 */
export function outdent(value: string, start: number, end: number): TextEdit {
  const { from, to } = lineBlock(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const widths = lines.map(line => Math.min(INDENT.length, (/^ +/.exec(line) ?? [''])[0].length))
  const total = widths.reduce((sum, width) => sum + width, 0)
  if (total === 0) return { value, start, end }
  const next = value.slice(0, from) + lines.map((line, index) => line.slice(widths[index]!)).join('\n') + value.slice(to)
  // 光标之前被删掉的那部分才影响偏移；行块之前的缩进不影响。
  const beforeCaret = Math.min(widths[0]!, Math.max(0, start - from))
  const caret = start - beforeCaret
  return { value: next, start: caret, end: start === end ? caret : Math.max(caret, end - total) }
}

/** Enter：保留当前行缩进；行尾是开括号或冒号时多缩进一级。选中文本时整段替换。 */
export function newline(value: string, start: number, end = start): TextEdit {
  const from = lineStartOf(value, start)
  const leading = (/^[ \t]*/.exec(value.slice(from, start)) ?? [''])[0]
  const before = value.slice(0, start)
  const last = before.slice(-1)
  const opener = last === '{' || last === '(' || last === '['
  const inserted = '\n' + leading + (opener ? INDENT : '')
  return {
    value: before + inserted + value.slice(Math.max(start, end)),
    start: start + inserted.length,
    end: start + inserted.length,
  }
}
