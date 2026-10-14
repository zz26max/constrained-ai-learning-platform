import { Lexer, type MarkedToken, type Token, type Tokens } from 'marked'
import { h, type VNodeChild } from 'vue'

// No HTML parser/renderer is used for document content. Only these built-in lexer
// tokens can create nodes; extension tokens and HTML never select a DOM element.
const standardTypes = new Set<string>([
  'blockquote', 'br', 'checkbox', 'code', 'codespan', 'def', 'del', 'em', 'escape',
  'heading', 'hr', 'html', 'image', 'link', 'list', 'list_item', 'paragraph', 'space',
  'strong', 'text', 'table',
])

function isStandardToken(token: Token): token is MarkedToken {
  return standardTypes.has(token.type)
}

/** Decode character references only. The DOM parser receives one entity, never
 * document markup, and its result is later passed to Vue as ordinary text. */
function decodeReferences(value: string): string {
  return value.replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, reference => {
    const parsed = new DOMParser().parseFromString(reference, 'text/html')
    return parsed.body.textContent ?? reference
  })
}

/** Destinations use a fixed protocol allowlist; relative paths cannot start a
 * second authority, contain backslashes, or hide a scheme behind whitespace. */
export function safeMarkdownUrl(raw: string, image = false): string | null {
  const value = decodeReferences(raw).trim()
  if (!value || /[\u0000-\u0020\u007f-\u009f\\]/.test(value) || value.startsWith('//')) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const url = new URL(value)
      const allowed = image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:']
      return allowed.includes(url.protocol) ? value : null
    } catch {
      return null
    }
  }
  // A colon in the first path segment is not a safe relative destination.
  if (/^[^/?#]*:/.test(value)) return null
  return value
}

function renderCell(cell: Tokens.TableCell): VNodeChild {
  return h(cell.header ? 'th' : 'td', {
    scope: cell.header ? 'col' : undefined,
    style: cell.align ? { textAlign: cell.align } : undefined,
  }, renderTokens(cell.tokens))
}

function renderTokens(tokens: readonly Token[]): VNodeChild[] {
  return tokens.map(token => {
    if (!isStandardToken(token)) return token.raw
    switch (token.type) {
      case 'space':
      case 'def':
      case 'html':
        return null
      case 'heading':
        // The resource page owns h1; Markdown headings start at h2.
        return h(`h${Math.min(6, Math.max(2, token.depth + 1))}`, renderTokens(token.tokens))
      case 'paragraph':
        return h('p', renderTokens(token.tokens))
      case 'blockquote':
        return h('blockquote', renderTokens(token.tokens))
      case 'hr':
        return h('hr')
      case 'strong':
        return h('strong', renderTokens(token.tokens))
      case 'em':
        return h('em', renderTokens(token.tokens))
      case 'del':
        return h('del', renderTokens(token.tokens))
      case 'br':
        return h('br')
      case 'code':
        return h('pre', [h('code', token.text)])
      case 'codespan':
        return h('code', token.text)
      case 'escape':
        return decodeReferences(token.text)
      case 'text':
        return token.tokens ? renderTokens(token.tokens) : decodeReferences(token.text)
      case 'link': {
        const href = safeMarkdownUrl(token.href)
        const children = renderTokens(token.tokens)
        return href === null ? children : h('a', {
          href,
          title: token.title ?? undefined,
          rel: 'noopener noreferrer',
        }, children)
      }
      case 'image': {
        const src = safeMarkdownUrl(token.href, true)
        const alt = decodeReferences(token.text)
        return src === null ? alt : h('img', {
          src,
          alt,
          title: token.title ?? undefined,
          loading: 'lazy',
          referrerpolicy: 'no-referrer',
        })
      }
      case 'list':
        return h(token.ordered ? 'ol' : 'ul', {
          start: token.ordered && typeof token.start === 'number' ? token.start : undefined,
        }, renderTokens(token.items))
      case 'list_item':
        return h('li', renderTokens(token.tokens))
      case 'checkbox':
        return h('input', { type: 'checkbox', checked: token.checked, disabled: true, 'aria-label': token.checked ? '已完成事项' : '未完成事项' })
      case 'table':
        return h('div', { class: 'markdown-table-scroll', tabindex: 0, role: 'region', 'aria-label': '资料表格，可横向滚动' }, [
          h('table', [
            h('thead', [h('tr', token.header.map(renderCell))]),
            h('tbody', token.rows.map(row => h('tr', row.map(renderCell)))),
          ]),
        ])
    }
  })
}

/** CommonMark/GFM parsing is supplied by the pinned lexer; rendering stays in
 * Vue's text and VNode APIs. Raw tags, arbitrary attributes and innerHTML are
 * never copied from the document. Code blocks remain verbatim plain text. */
export function renderSafeMarkdown(content: string): VNodeChild[] {
  return renderTokens(Lexer.lex(content, { gfm: true, breaks: false }))
}
