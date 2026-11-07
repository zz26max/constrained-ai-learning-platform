// Real browser acceptance against the local backend and isolated check runners.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const out = new URL('../.cache/checks/', import.meta.url)
mkdirSync(out, { recursive: true })
const base = 'http://127.0.0.1:4173/'
const prefix = '自动判题验收 ' + new Date().toISOString().replace(/[:.]/g, '-')
const dueDate = new Date(Date.now() + 14 * 86400000)
const dueAt = new Date(dueDate.getTime() - dueDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const seedSql = 'CREATE TABLE scores (id INT PRIMARY KEY, score INT); INSERT INTO scores VALUES (1,80);'
const verificationSql = 'SELECT id, score FROM scores ORDER BY id'
const cases = [
  { name: 'web', fail: '<h1>Try again</h1>', pass: '<h1>Correct heading</h1>' },
  { name: 'select', expected: [['1', '80']], fail: 'SELECT id, 79 FROM scores;', pass: 'SELECT id, score FROM scores;' },
  { name: 'insert', expected: [['1', '80'], ['2', '90']], fail: 'INSERT INTO scores VALUES (2, 70);', pass: 'INSERT INTO scores VALUES (2, 90);' },
  { name: 'update', expected: [['1', '90']], fail: 'UPDATE scores SET score = 70 WHERE id = 1;', pass: 'UPDATE scores SET score = 90 WHERE id = 1;' },
  { name: 'delete', expected: [], fail: 'DELETE FROM scores WHERE id = 2;', pass: 'DELETE FROM scores WHERE id = 1;' },
]
const selected = process.argv.includes('--web-only') ? cases.slice(0, 1) : cases
const checks = []
const browserErrors = []
const secrets = []
const evidence = { offering: null, assignments: {}, checks, browserErrors }
let browser
let teacher
let student
let step = 'startup'
let inviteVisible = false

function saveResult(result, error) {
  writeFileSync(new URL('result.json', out), JSON.stringify({
    at: new Date().toISOString(), result, step, cases: selected.map(item => item.name), ...evidence,
    ...(error ? { error } : {}),
  }, null, 2))
}

function redact(message) {
  return secrets.reduce((safe, secret) => safe.split(secret).join('[redacted]'), String(message))
}

const button = (page, name) => page.getByRole('button', { name, exact: true })
const screenshot = (page, name) => page.screenshot({
  path: fileURLToPath(new URL(name + '.png', out)), fullPage: true,
})

async function nav(page, path) {
  await page.goto(base + '#' + path)
  await page.locator('main h1').waitFor()
}

async function login(role, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => browserErrors.push(redact(error.message)))
  await nav(page, '/login')
  await page.locator('#login-username').fill(role + '.demo')
  await page.locator('#login-password').fill(password)
  await button(page, '登录').click()
  await page.waitForURL(url => !url.hash.startsWith('#/login'))
  return page
}

function response(page, method, path) {
  return page.waitForResponse(value => value.request().method() === method && new URL(value.url()).pathname === '/api/v1' + path)
}

async function createFixture() {
  await button(teacher, '创建教学班').click()
  await teacher.locator('input[name="base-course"]').first().check()
  await teacher.locator('#offering-title').fill(prefix)
  await teacher.locator('#offering-group').fill('自动判题浏览器验收班')
  await button(teacher.getByRole('dialog'), '创建教学班').click()
  await teacher.waitForURL(/teacher\/offerings\/[a-f0-9-]+$/)
  evidence.offering = teacher.url().split('/offerings/')[1]
  await button(teacher, '创建章节草稿').click()
  await teacher.locator('#chapter-title').fill('自动判题练习')
  await teacher.locator('#chapter-summary').fill('通过 Web 与 SQL 作业验证自动检查。')
  const creating = response(teacher, 'POST', '/teacher/offerings/' + evidence.offering + '/chapters')
  await button(teacher, '创建草稿').click()
  const created = await creating
  assert.equal(created.status(), 201)
  const chapter = (await created.json()).data.id
  await button(teacher, '发布章节').click()
  const [published] = await Promise.all([
    response(teacher, 'POST', '/teacher/chapters/' + chapter + '/publish'),
    button(teacher.getByRole('dialog'), '确认').click(),
  ])
  assert.equal(published.status(), 200)
  await button(teacher, '邀请码').click()
  await button(teacher, '创建邀请码').click()
  await teacher.locator('#invite-expiry').fill(dueAt)
  inviteVisible = true
  await button(teacher.getByRole('dialog'), '创建邀请码').click()
  const invite = await teacher.locator('.teacher-secret code').innerText()
  secrets.push(invite)
  await button(teacher, '已保存，关闭').click()
  inviteVisible = false
  await nav(student, '/course')
  await button(student, '加入课程').click()
  await student.getByRole('dialog').getByRole('textbox').fill(invite)
  await button(student.getByRole('dialog'), '确认加入').click()
  await student.getByRole('dialog').waitFor({ state: 'hidden' })
  return chapter
}

async function configureAndPublish(chapter, item) {
  const root = '/teacher/offerings/' + evidence.offering + '/assignments'
  await nav(teacher, root + '/new')
  const title = prefix + ' ' + item.name
  await teacher.locator('#title').fill(title)
  if (item.name !== 'web') {
    await teacher.locator('#assignment-type').selectOption('sql_text')
    await button(teacher, '确认切换类型').click()
  }
  await teacher.locator('#description').fill('使用真实检查服务验证 ' + item.name + ' 正反例。')
  await teacher.locator('#chapter').selectOption(chapter)
  await teacher.locator('fieldset.surface>fieldset').first().locator('textarea').last().fill('完成作品并运行自动检查。')
  await teacher.locator('#dueAt').fill(dueAt)
  await button(teacher, '保存').click()
  await teacher.waitForURL(/teacher\/assignments\/[a-f0-9-]+$/)
  const id = teacher.url().split('/assignments/')[1]
  evidence.assignments[item.name] = id

  const policy = teacher.locator('details.teacher-check-policy')
  await policy.locator('summary').click()
  await policy.getByLabel('配置自动检查').check()
  if (item.name === 'web') {
    await policy.getByLabel('CSS 选择器').fill('h1')
    await policy.getByLabel('检查类型').selectOption('text')
    await policy.getByLabel('预期值').fill('Correct heading')
  } else {
    const mutation = item.name !== 'select'
    await policy.getByLabel('SQL 题型').selectOption(mutation ? 'mutation' : 'query')
    await policy.getByLabel('练习库初始化 SQL').fill(seedSql)
    if (mutation) await policy.getByLabel('修改后的验证查询').fill(verificationSql)
    await policy.getByLabel('预期结果行（JSON）').fill(JSON.stringify(item.expected))
    await policy.getByLabel('按行顺序比对').check()
  }
  const saving = response(teacher, 'PUT', '/teacher/assignments/' + id + '/check-policy')
  await button(policy, '保存检查规则').click()
  assert.equal((await saving).status(), 200)
  await policy.getByText('自动检查规则已保存', { exact: true }).waitFor()

  await nav(teacher, root)
  const row = teacher.getByRole('listitem').filter({ has: teacher.getByText(title, { exact: true }) })
  const publishing = response(teacher, 'POST', '/teacher/assignments/' + id + '/publish')
  await button(row, '发布').click()
  assert.equal((await publishing).status(), 200)
  await nav(teacher, '/teacher/assignments/' + id)
  await policy.locator('summary').click()
  await policy.getByText('当前规则仅供查看。', { exact: true }).waitFor()
  assert.ok(await policy.getByLabel('配置自动检查').isDisabled())
  return id
}

async function verifyCheck(item, id, variant, expected, revision) {
  await student.locator('textarea.workspace-editor').fill(item[variant])
  const checkButton = button(student, '自动检查')
  const saving = response(student, 'PUT', '/assignments/' + id + '/workspace')
  const creating = response(student, 'POST', '/assignments/' + id + '/checks')
  await checkButton.click()
  const saved = await saving
  const created = await creating
  assert.equal(saved.status(), 200)
  assert.equal(created.status(), 202)
  assert.equal((await saved.json()).data.revision, revision)
  assert.equal(created.request().postDataJSON().workspaceRevision, revision)
  const { checkId } = (await created.json()).data
  const result = student.locator('.ws-check')
  const passText = '通过 ' + expected + ' / 1 项。正式成绩以教师评价为准。'
  await result.getByText(passText, { exact: true }).or(result.getByText(/检查未完成。/)).waitFor({ timeout: 120000 })
  assert.ok(await result.getByText(passText, { exact: true }).isVisible(), await result.innerText())
  checks.push({ case: item.name, variant, revision, checkId, passed: expected, total: 1 })
  saveResult('RUNNING')
}

saveResult('RUNNING')
try {
  const env = Object.fromEntries(readFileSync(new URL('../../backend/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('=') && !line.trimStart().startsWith('#'))
    .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]))
  for (const role of ['teacher', 'student']) {
    const password = env['LOCAL_' + role.toUpperCase() + '_PASSWORD']
    assert.ok(password, 'Missing local demo password for ' + role)
    secrets.push(password)
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  step = 'sign in'
  teacher = await login('teacher', secrets[0])
  student = await login('student', secrets[1])
  step = 'create and join a dedicated teaching class'
  const chapter = await createFixture()
  for (const item of selected) {
    step = 'configure and publish ' + item.name
    saveResult('RUNNING')
    const id = await configureAndPublish(chapter, item)
    step = 'verify ' + item.name + ' incorrect answer'
    const reading = response(student, 'GET', '/assignments/' + id + '/checks')
    await nav(student, '/student/workspaces/' + id)
    const availability = await reading
    assert.equal(availability.status(), 200)
    assert.deepEqual((await availability.json()).data, { configured: true, check: null })
    await verifyCheck(item, id, 'fail', 0, 1)
    step = 'verify ' + item.name + ' correct answer'
    await verifyCheck(item, id, 'pass', 1, 2)
    if (item.name === 'web' || item.name === 'update') {
      step = 'verify 390px layout for ' + item.name
      for (const [page, role] of [[teacher, 'teacher'], [student, 'student']]) {
        await page.setViewportSize({ width: 390, height: 1000 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), role + ' overflow at 390px')
        await screenshot(page, item.name + '-' + role + '-390')
        await page.setViewportSize({ width: 1440, height: 1000 })
      }
    }
    console.log('PASS: ' + item.name + ' browser configuration, publication, incorrect and correct answers.')
  }
  assert.deepEqual(browserErrors, [])
  step = 'complete'
  saveResult('PASS')
} catch (error) {
  const message = redact(error.message)
  saveResult('FAIL', message)
  if (teacher && !inviteVisible) await screenshot(teacher, 'failure-teacher').catch(() => {})
  if (student && !inviteVisible && !step.startsWith('create and join')) await screenshot(student, 'failure-student').catch(() => {})
  console.error('FAIL at ' + step + ': ' + message)
  process.exitCode = 1
} finally {
  await browser?.close()
}
