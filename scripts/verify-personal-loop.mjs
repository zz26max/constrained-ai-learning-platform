#!/usr/bin/env node
// 个人模式闭环验收：注册临时账号 → 找到个人课程与示例作业 → 发一次 AI 求助 → 轮询终态并打印结果。
// 不读取 backend/.env；账号为一次性临时账号，配合 --cleanup 用 docker exec 清理。

import { execFileSync } from 'node:child_process'

const base = arg('--base') || 'http://127.0.0.1:4173'
const keep = has('--keep')
const cleanup = has('--cleanup')
const suffix = String(Date.now()).slice(-8)
const username = `verify.personal.${suffix}`
const password = 'Verify1234'
const jars = new Map()

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
function has(name) { return process.argv.includes(name) }

function storeCookies(response) {
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : []
  for (const line of raw) {
    const [pair] = line.split(';')
    const at = pair.indexOf('=')
    if (at > 0) jars.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
  }
}
function cookieHeader() { return [...jars].map(([k, v]) => `${k}=${v}`).join('; ') }

async function call(path, { method = 'GET', body, csrf } = {}) {
  const headers = { Origin: base }
  if (jars.size) headers.Cookie = cookieHeader()
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (csrf) headers['X-CSRF-Token'] = csrf
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  storeCookies(response)
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 保留原文 */ }
  return { status: response.status, json, text }
}

function cleanupSql() {
  const sql = `DELETE m FROM tutoring_messages m JOIN tutoring_requests t ON t.id=m.tutoring_request_id JOIN users u ON u.id=t.student_id WHERE u.username='${username}';` +
    `DELETE t FROM tutoring_requests t JOIN users u ON u.id=t.student_id WHERE u.username='${username}';` +
    `DELETE s FROM tutoring_sessions s JOIN users u ON u.id=s.student_id WHERE u.username='${username}';` +
    `DELETE p FROM tutoring_progress p JOIN users u ON u.id=p.student_id WHERE u.username='${username}';` +
    `DELETE FROM learning_events WHERE user_id IN (SELECT id FROM users WHERE username='${username}');` +
    `DELETE FROM offering_members WHERE user_id IN (SELECT id FROM users WHERE username='${username}');` +
    `DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE username='${username}');` +
    `DELETE FROM users WHERE username='${username}';`
  execFileSync('docker', ['exec', '-i', 'learning-platform-dev-db-1', 'sh', '-c',
    'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot -N -B learning_platform'], { input: sql, encoding: 'utf8' })
}

const csrfResponse = await call('/api/v1/auth/csrf-token')
const preCsrf = csrfResponse.json?.data?.csrfToken
console.log(`csrf ${csrfResponse.status} token=${preCsrf ? 'ok' : 'missing'}`)

const registered = await call('/api/v1/auth/register', {
  method: 'POST', csrf: preCsrf,
  body: { username, password, displayName: `闭环验收 ${suffix}`, mode: 'personal' },
})
console.log(`register ${registered.status} user=${registered.json?.data?.user?.username ?? registered.text.slice(0, 120)}`)
const csrf = registered.json?.data?.csrfToken

const courses = await call('/api/v1/me/courses?status=all&page=1&pageSize=50')
const offerings = courses.json?.data?.items ?? []
const personal = offerings.find(item => String(item.title ?? '').includes('个人学习')) ?? offerings[0]
console.log(`courses ${courses.status} count=${offerings.length} picked=${personal?.offeringId ?? 'none'}`)

const assignments = await call(`/api/v1/me/assignments?offeringId=${personal?.offeringId ?? ''}&status=all&page=1&pageSize=50`)
const items = assignments.json?.data?.items ?? []
console.log(`assignments ${assignments.status} count=${items.length}`)
for (const item of items.slice(0, 4)) console.log(`  - ${item.type} ${item.title} aiPolicyVersion=${item.aiPolicyVersion}`)

const target = items.find(item => item.type === 'web_lab') ?? items[0]
if (!target) { console.log('FAIL: 没有找到示例作业'); process.exit(1) }

const session = await call('/api/v1/tutoring/sessions', { method: 'POST', csrf, body: { assignmentId: target.id } })
console.log(`session ${session.status} id=${session.json?.data?.id ?? 'missing'}`)

const sent = await call(`/api/v1/tutoring/sessions/${session.json?.data?.id}/messages`, {
  method: 'POST', csrf,
  body: { action: 'next_hint', content: '手机上打开页面，内容整体缩小，应该先检查哪里？', studentAttempt: '我加了 meta charset，没有改观。' },
})
const requestId = sent.json?.data?.tutoringRequestId
console.log(`send ${sent.status} request=${requestId ?? sent.text.slice(0, 120)}`)

let result = null
for (let i = 0; i < 60; i += 1) {
  await new Promise(resolve => setTimeout(resolve, 1000))
  const polled = await call(`/api/v1/tutoring/requests/${requestId}`)
  const data = polled.json?.data
  if (data && ['completed', 'fallback', 'failed'].includes(data.status)) { result = data; break }
}
if (!result) { console.log('FAIL: 轮询 60 秒未拿到终态'); process.exit(1) }

const citations = result.result?.citations ?? []
console.log(`status=${result.status} mode=${result.result?.mode ?? '-'} hintLevel=${result.result?.hintLevel ?? '-'}`)
console.log(`citations=${citations.length}${citations.length ? ' -> ' + citations.map(c => c.title).join(' / ') : ''}`)
console.log(`content=${String(result.result?.content ?? '').slice(0, 160).replace(/\s+/g, ' ')}`)
console.log(`error=${result.error?.code ?? '-'}`)

if (cleanup && !keep) { cleanupSql(); console.log(`cleaned up ${username}`) }
else console.log(`kept test account ${username}`)
