import { describe, expect, it } from 'vitest'
import { highlightEditorSource } from '../src/features/assignments/editor-syntax'

describe('工作区语法标记', () => {
  it.each([
    ['index.html', '<!-- one\n two -->\n<p title="a > b">你好</p>', 'tag', '<p title="a > b">'],
    ['style.css', '/* theme */\np { margin: 12px; color: #254b77 }', 'number', '12px'],
    ['script.js', 'const label = `line\nsecond`; // return\nlet returning = true;', 'string', '`line\nsecond`'],
    ['answer.sql', "SELECT 'it''s' AS text; -- SELECT", 'string', "'it''s'"],
    ['answer.md', '## 例子\n```js\nconst title = 1\n```\n正文', 'string', '```js\nconst title = 1\n```'],
  ])('为 %s 标记语法并保留原文', (file, source, kind, text) => {
    const tokens = highlightEditorSource(file, source)
    expect(tokens.map(token => token.text).join('')).toBe(source)
    expect(tokens).toContainEqual({ kind, text })
  })

  it('空白和高密度文件保留原生纯文本显示', () => {
    expect(highlightEditorSource('index.html', '  \n')).toEqual([])
    expect(highlightEditorSource('script.js', 'const x = 1;\n'.repeat(3000))).toEqual([])
    expect(highlightEditorSource('answer.md', '#'.repeat(48_001))).toEqual([])
  })
})
