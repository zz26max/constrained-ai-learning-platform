import { describe, expect, it } from 'vitest'
import { buildWebPreview, previewMessage } from '../src/features/assignments/web-preview'
const nonce = '00000000-0000-4000-8000-000000000001'
describe('Web 预览可信边界', () => {
  it('作品中的闭合标签不能逃逸可信引导脚本', () => {
    const source = buildWebPreview({ 'index.html': '<h1>作品</h1>', 'style.css': '</style><script>steal()</script>', 'script.js': '</script><script>steal()</script>' }, nonce)
    expect(source.match(/<script /g)).toHaveLength(1)
    expect(source.match(/<\/script>/g)).toHaveLength(1)
    expect(source).toContain('\\u003c/script\\u003e')
    expect(source).toContain("connect-src 'none'")
  })
  it('移除导航、外部资源与嵌套框架，包括 template 中的内容', () => {
    const source = buildWebPreview({ 'index.html': '<base href="https://outside.test"><meta http-equiv="refresh" content="0;url=https://outside.test"><iframe src="/api/v1/me"></iframe><img src="https://outside.test/x" onerror="steal()"><template><iframe src="/login"></iframe></template><a href="javascript:steal()" target="_top">x</a>' }, nonce)
    expect(source).not.toContain('outside.test')
    expect(source).not.toContain('/api/v1/me')
    expect(source).not.toContain('onerror')
    expect(source).not.toContain('javascript:')
  })
  it('消息须匹配当前随机标识和白名单结构', () => {
    expect(previewMessage({ type: 'learning-preview', nonce, kind: 'ready', text: 'loaded' }, nonce)).toBe('loaded')
    expect(previewMessage({ type: 'learning-preview', nonce: 'old', kind: 'ready', text: 'loaded' }, nonce)).toBeNull()
    expect(previewMessage({ type: 'learning-preview', nonce, kind: 'fetch', text: '/api/v1/me' }, nonce)).toBeNull()
  })
})
