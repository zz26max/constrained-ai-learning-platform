import { readFileSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

export const fixtureSchema = 1
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const defaultOutput = fileURLToPath(new URL('../.cache/zhixue/', import.meta.url))

// Deliberately does not load backend/.env implicitly or implement shell expansion.
export function parseCredentialsFile(text) {
  return Object.fromEntries(text.replace(/^\uFEFF/, '').split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*(LOCAL_(?:STUDENT|TEACHER)_PASSWORD)\s*=(.*)$/)
    if (!match) return []
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    return [[match[1], value]]
  }))
}

export function loadAcceptanceConfig(env = process.env, read = readFileSync) {
  const fail = message => { throw new Error('Browser acceptance configuration: ' + message) }
  let url
  try { url = new URL(env.BROWSER_ACCEPTANCE_BASE_URL) } catch { fail('set BROWSER_ACCEPTANCE_BASE_URL to the isolated frontend origin') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('base URL must be an HTTP(S) origin without credentials, path, query or fragment')
  if (env.BROWSER_ACCEPTANCE_ALLOW_WRITES !== 'isolated-fixtures') fail('set BROWSER_ACCEPTANCE_ALLOW_WRITES=isolated-fixtures only for a disposable test environment; these scripts write persistent records')
  const file = env.BROWSER_ACCEPTANCE_ENV_FILE
  let fromFile = {}
  if (file) {
    try { fromFile = parseCredentialsFile(read(resolve(file), 'utf8')) } catch { fail('cannot read the explicitly selected credentials file') }
  }
  const credentials = Object.fromEntries(['student', 'teacher'].map(role => {
    const key = role.toUpperCase()
    const username = env['BROWSER_ACCEPTANCE_' + key + '_USERNAME'] || role + '.demo'
    const password = env['BROWSER_ACCEPTANCE_' + key + '_PASSWORD'] || fromFile['LOCAL_' + key + '_PASSWORD']
    if (!password) fail('missing ' + role + ' password; set the role-specific environment variable or explicitly select a credentials file')
    return [role, { username, password }]
  }))
  if (credentials.student.username === credentials.teacher.username) fail('student and teacher must be different dedicated test accounts')
  const timeout = Number(env.BROWSER_ACCEPTANCE_TIMEOUT_MS || 45000)
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 180000) fail('timeout must be an integer from 1000 to 180000 ms')
  const executablePath = env.BROWSER_ACCEPTANCE_EXECUTABLE_PATH
  const channel = env.BROWSER_ACCEPTANCE_CHANNEL
  if (executablePath && channel) fail('select either a browser executable path or a channel')
  if (executablePath && !isAbsolute(executablePath)) fail('browser executable path must be absolute')
  return {
    base: url.origin + '/', credentials, timeout,
    outputRoot: resolve(env.BROWSER_ACCEPTANCE_OUTPUT_DIR || defaultOutput),
    fixturePath: env.BROWSER_ACCEPTANCE_FIXTURE ? resolve(env.BROWSER_ACCEPTANCE_FIXTURE) : undefined,
    launchOptions: { headless: true, ...(executablePath ? { executablePath } : { channel: channel || 'chromium' }) },
  }
}

export function newFixture(config, now = new Date(), id = randomUUID()) {
  return {
    schemaVersion: fixtureSchema, runId: id, at: now.toISOString(), target: config.base,
    accounts: Object.fromEntries(Object.entries(config.credentials).map(([role, value]) => [role, value.username])),
    prefix: '知学验收 ' + id, offering: null, chapter: null, assignments: [], result: 'IN_PROGRESS',
    writes: ['teaching offering/chapter/invite', 'student enrollment/read progress', 'three assignments/workspaces/submissions', 'feedback publication/notifications', 'normal session/audit/learning events'],
  }
}

export function validateFixture(fixture, config) {
  const fail = message => { throw new Error('Browser acceptance fixture: ' + message) }
  if (fixture?.schemaVersion !== fixtureSchema || fixture.result !== 'PASS' || !uuid.test(fixture.runId || '')) fail('requires a successful versioned main-run result.json; old or partial results are refused')
  if (fixture.target !== config.base) fail('target differs from the main run')
  for (const role of ['student', 'teacher']) if (fixture.accounts?.[role] !== config.credentials[role].username) fail('accounts differ from the main run')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fixture.calendarDate || '')) fail('missing main-run calendar date')
  if (fixture.prefix !== '知学验收 ' + fixture.runId) fail('invalid fixture naming prefix')
  if (!uuid.test(fixture.offering || '') || !uuid.test(fixture.chapter || '') || !Array.isArray(fixture.assignments) || fixture.assignments.length !== 3 || fixture.assignments.some(id => !uuid.test(id)) || new Set(fixture.assignments).size !== 3) fail('expected offering/chapter and three distinct assignment UUIDs')
  return fixture
}

export function validateFixtureRecords(fixture, offering, assignments) {
  if (offering?.id !== fixture.offering || offering.title !== fixture.prefix || assignments.length !== 3 || assignments.some((assignment, index) => assignment.id !== fixture.assignments[index] || assignment.offeringId !== fixture.offering || assignment.title !== fixture.prefix + ' ' + ['web_lab', 'sql_text', 'text'][index] || assignment.type !== ['web_lab', 'sql_text', 'text'][index])) {
    throw new Error('Browser acceptance fixture: server records do not match the isolated main-run fixture; no boundary mutations were started')
  }
}
