import { chromium } from 'playwright-core'

let input = ''
for await (const chunk of process.stdin.setEncoding('utf8')) {
  input += chunk
  // JSON can expand each control character into a six-character escape.
  if (input.length > 2000000) process.exit(2)
}
const { files, rules } = JSON.parse(input)
const origin = 'http://exercise.invalid'
const types = {
  '/index.html': 'text/html; charset=utf-8',
  '/style.css': 'text/css; charset=utf-8',
  '/script.js': 'text/javascript; charset=utf-8',
}
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] })
try {
  const items = []
  for (const rule of rules) {
    const context = await browser.newContext({
      viewport: { width: rule.width, height: 900 },
      serviceWorkers: 'block',
      javaScriptEnabled: false,
      acceptDownloads: false,
    })
    let passed = false
    try {
      await context.route('**/*', async route => {
        const request = route.request()
        const url = new URL(request.url())
        if (request.method() !== 'GET' || url.origin !== origin || !Object.hasOwn(types, url.pathname)) {
          await route.abort()
          return
        }
        await route.fulfill({
          contentType: types[url.pathname],
          body: files[url.pathname.slice(1)] ?? '',
          headers: {
            'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'",
          },
        })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(1000)
      await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded', timeout: 2000 })
      const element = page.locator(rule.selector).first()
      if (await element.count()) {
        if (rule.check === 'exists') passed = true
        if (rule.check === 'text') passed = (await element.textContent())?.trim() === rule.expected
        if (rule.check === 'css') {
          passed = await element.evaluate((node, property) =>
            getComputedStyle(node).getPropertyValue(property).trim(), rule.property) === rule.expected
        }
      }
    } catch (error) {
      if (error.name === 'TimeoutError') {
        process.exitCode = 124
        break
      }
      // A malformed selector or inaccessible page is a failed assertion.
      if (!String(error.message).includes('selector') && !String(error.message).includes('net::ERR_')) throw error
    } finally {
      await context.close()
    }
    items.push({
      ruleId: rule.id,
      status: passed ? 'pass' : 'fail',
      message: passed ? '符合此项要求。' : '未通过，请检查对应结构、内容或样式。',
    })
  }
  if (!process.exitCode) {
    console.log(JSON.stringify({
      items,
      passed: items.filter(item => item.status === 'pass').length,
      total: items.length,
      output: '',
      truncated: false,
    }))
  }
} finally {
  await browser.close()
}
