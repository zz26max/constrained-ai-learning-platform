type SyntaxKind = 'plain' | 'comment' | 'string' | 'keyword' | 'tag' | 'number'
export interface SyntaxToken { text: string; kind: SyntaxKind }

const grammars: Record<string, RegExp> = {
  'index.html': /(?<comment><!--[^]*?(?:-->|$))|(?<tag><\/?[a-zA-Z](?:[^<>"']|"[^"\n]*"|'[^'\n]*')*>|<!doctype\s+[^<>]*>)/gi,
  'style.css': /(?<comment>\/\*[^]*?(?:\*\/|$))|(?<string>"(?:\\[^]|[^"\\\n])*"|'(?:\\[^]|[^'\\\n])*')|(?<keyword>@[\w-]+|(?<![\w-])[\w-]+(?=\s*:))|(?<number>#[\da-f]{3,8}\b|\b\d+(?:\.\d+)?(?:[a-z]+\b|%)?)/gi,
  'script.js': /(?<comment>\/\/[^\n]*|\/\*[^]*?(?:\*\/|$))|(?<string>"(?:\\[^]|[^"\\\n])*"|'(?:\\[^]|[^'\\\n])*'|`(?:\\[^]|[^`\\])*`)|(?<keyword>\b(?:async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|super|switch|this|throw|true|try|typeof|undefined|var|void|while|yield)\b)|(?<number>\b\d+(?:\.\d+)?\b)/g,
  'answer.sql': /(?<comment>--[^\n]*|#[^\n]*|\/\*[^]*?(?:\*\/|$))|(?<string>'(?:''|\\[^]|[^'\\])*'|"(?:""|\\[^]|[^"\\])*"|`(?:``|[^`])*`)|(?<keyword>\b(?:select|from|where|group|by|having|order|limit|offset|join|left|right|inner|outer|cross|on|as|distinct|union|all|and|or|not|null|is|in|like|between|exists|asc|desc|case|when|then|else|end|insert|into|values|update|set|delete|with|count|sum|avg|min|max)\b)|(?<number>\b\d+(?:\.\d+)?\b)/gi,
  'answer.md': /(?<comment><!--[^]*?(?:-->|(?![^])))|(?<string>^```[^]*?(?:^```[^\n]*|(?![^]))|`[^`\n]+`)|(?<keyword>^ {0,3}#{1,6}(?: +[^\n]*|$)|^ {0,3}>[^\n]*)/gm,
}

/** Vue renders these tokens as text. An empty list keeps the native editor legible for large files. */
export function highlightEditorSource(file: string, source: string): SyntaxToken[] {
  const grammar = grammars[file]
  if (!(grammar instanceof RegExp) || source.length > 48_000) return []

  const tokens: SyntaxToken[] = []
  let previous = 0
  for (const match of source.matchAll(grammar)) {
    const kind = Object.keys(match.groups ?? {}).find(name => match.groups?.[name] !== undefined) as SyntaxKind
    if (match.index > previous) tokens.push({ text: source.slice(previous, match.index), kind: 'plain' })
    tokens.push({ text: match[0], kind })
    if (tokens.length > 2400) return []
    previous = match.index + match[0].length
  }
  if (tokens.length && previous < source.length) tokens.push({ text: source.slice(previous), kind: 'plain' })
  return tokens
}
