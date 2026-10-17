/** 只把作品作为转义后的数据交给隔离窗口，不把作品拼进可信 script/style 标签。 */
export function buildWebPreview(files: Record<string, string>, nonce: string): string {
  if (!/^[a-f0-9-]{36}$/.test(nonce)) throw new Error('无效预览标识')
  const template = document.createElement('template')
  template.innerHTML = files['index.html'] ?? ''
  const scripts: string[] = []
  let usesScriptFile = false
  const clean = (root: DocumentFragment) => {
    for (const element of Array.from(root.querySelectorAll('*'))) {
      const tag = element.localName.toLowerCase()
      if (tag === 'script') {
        const src = element.getAttribute('src')
        if (src === 'script.js' || src === './script.js') { scripts.push(files['script.js'] ?? ''); usesScriptFile = true }
        else if (!src) scripts.push(element.textContent ?? '')
        element.remove(); continue
      }
      if (['base', 'meta', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link'].includes(tag)) { element.remove(); continue }
      if (tag === 'template') clean((element as HTMLTemplateElement).content)
      for (const attr of Array.from(element.attributes)) {
        const name = attr.name.toLowerCase()
        if (name.startsWith('on') || ['srcdoc', 'srcset', 'action', 'formaction', 'target', 'download', 'ping', 'nonce'].includes(name)) element.removeAttribute(attr.name)
        if (['href', 'xlink:href', 'src', 'poster', 'background'].includes(name)) {
          const value = attr.value.trim()
          if (!(tag === 'img' && name === 'src' && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(value)) && !(tag === 'a' && name === 'href' && /^#[\w-]*$/.test(value))) element.removeAttribute(attr.name)
        }
      }
    }
  }
  clean(template.content)
  if (!usesScriptFile) scripts.push(files['script.js'] ?? '')
  const payload = JSON.stringify({ html: template.innerHTML, css: files['style.css'] ?? '', scripts, nonce })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body><script nonce="${nonce}">
(() => {
  const data = ${payload};
  const report = (kind, text) => parent.postMessage({ type: 'learning-preview', nonce: data.nonce, kind, text: String(text).slice(0, 500) }, '*');
  addEventListener('error', event => report('error', event.message));
  addEventListener('unhandledrejection', () => report('error', '预览脚本请求失败'));
  const content = document.createElement('template'); content.innerHTML = data.html;
  document.body.append(content.content);
  const style = document.createElement('style'); style.textContent = data.css; document.head.append(style);
  for (const code of data.scripts) { const script = document.createElement('script'); script.nonce = data.nonce; script.textContent = code; document.body.append(script); }
  report('ready', '预览已加载');
})();
</script></body></html>`
}

export function previewMessage(value: unknown, nonce: string): string | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (data.type !== 'learning-preview' || data.nonce !== nonce || !['ready', 'error'].includes(String(data.kind)) || typeof data.text !== 'string' || data.text.length > 500) return null
  return data.text
}
