import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SafeMarkdown from '../src/components/SafeMarkdown.vue'
import { safeMarkdownUrl } from '../src/features/courses/safe-markdown'

describe('P1-A 受控 Markdown', () => {
  it('剔除 script、原生HTML和事件属性，代码仅作为文本展示', () => {
    const source = '<script>alert("script")</script>\n\n<img src=x onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n普通 **正文**\n\n```html\n<img src=x onerror="alert(1)">\n</script>\n```'
    const wrapper = mount(SafeMarkdown, { props: { content: source } })
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('[onerror]').exists()).toBe(false)
    expect(wrapper.find('strong').text()).toBe('正文')
    expect(wrapper.find('pre code').text()).toBe('<img src=x onerror="alert(1)">\n</script>')
  })

  it('阻断危险链接和图片协议，并保留链接文字', () => {
    const wrapper = mount(SafeMarkdown, { props: { content: '[脚本](javascript:alert%281%29) [实体脚本](javascript&colon;alert%281%29) [数据](data:text/html,x) [旧脚本](vbscript:msgbox) ![危险图片](data:image/svg+xml,x)' } })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('脚本')
    expect(wrapper.text()).toContain('实体脚本')
    expect(wrapper.text()).toContain('危险图片')
    for (const value of ['JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'javascript&#58;alert(1)', '//evil.example', '\\evil.example', 'file:///local/file']) {
      expect(safeMarkdownUrl(value)).toBeNull()
    }
  })

  it('支持真实Markdown块、嵌套列表、表格、引用、任务列表和安全链接', () => {
    const wrapper = mount(SafeMarkdown, { props: { content: '# 学习目标\n\n> 理解 *布局* 与 ~~旧策略~~。\n\n- 父任务\n  - 子任务\n- [x] 完成\n\n| 名称 | 数值 |\n| :--- | ---: |\n| 宽度 | 320 |\n\n[官方](https://example.com?a=1&amp;b=2) [联系](mailto:teacher@example.com) [章节](/course/a/chapter/b)\n\n`<script>&amp;`\n\n---' } })
    expect(wrapper.find('h2').text()).toBe('学习目标')
    expect(wrapper.find('blockquote em').text()).toBe('布局')
    expect(wrapper.find('del').text()).toBe('旧策略')
    expect(wrapper.find('ul ul li').text()).toBe('子任务')
    expect(wrapper.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('table th').attributes('scope')).toBe('col')
    expect(wrapper.find('table td').text()).toBe('宽度')
    expect(wrapper.findAll('a').map(a => a.attributes('href'))).toEqual(['https://example.com?a=1&b=2', 'mailto:teacher@example.com', '/course/a/chapter/b'])
    expect(wrapper.find('code').text()).toBe('<script>&amp;')
    expect(wrapper.find('hr').exists()).toBe(true)
  })

  it('属性更新重新安全渲染，字符实体作为文本，不形成HTML节点', async () => {
    const wrapper = mount(SafeMarkdown, { props: { content: '第一版' } })
    await wrapper.setProps({ content: '&lt;script&gt;alert(1)&lt;/script&gt; &amp;\n\n![示例](https://example.com/image.png "图片标题")' })
    expect(wrapper.text()).toContain('<script>alert(1)</script> &')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/image.png')
    expect(wrapper.find('img').attributes('referrerpolicy')).toBe('no-referrer')
    expect(wrapper.text()).not.toContain('第一版')
  })
})
