import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAcceptanceConfig, parseCredentialsFile, newFixture, validateFixture, validateFixtureRecords } from './browser-acceptance-config.mjs'

const env = () => ({
  BROWSER_ACCEPTANCE_BASE_URL: 'http://127.0.0.1:49173',
  BROWSER_ACCEPTANCE_ALLOW_WRITES: 'isolated-fixtures',
  BROWSER_ACCEPTANCE_STUDENT_PASSWORD: 'student-test-only',
  BROWSER_ACCEPTANCE_TEACHER_PASSWORD: 'teacher-test-only',
})
function successfulFixture(config = loadAcceptanceConfig(env())) {
  return { ...newFixture(config), result: 'PASS', offering: randomUUID(), chapter: randomUUID(), assignments: [randomUUID(), randomUUID(), randomUUID()], calendarDate: '2030-01-01' }
}

test('requires explicit isolated target and write opt-in before reading credentials', () => {
  let reads = 0
  const read = () => { reads++; throw new Error('must not read') }
  assert.throws(() => loadAcceptanceConfig({}, read), /BASE_URL/)
  assert.throws(() => loadAcceptanceConfig({ BROWSER_ACCEPTANCE_BASE_URL: 'http://localhost:4173', BROWSER_ACCEPTANCE_ENV_FILE: 'private' }, read), /ALLOW_WRITES/)
  assert.equal(reads, 0)
})
test('rejects non-origin URLs without leaking their contents', () => {
  for (const url of ['file:///tmp', 'https://user:secret@example.test/', 'https://example.test/path', 'https://example.test/?token=secret', 'https://example.test/#/login']) {
    assert.throws(() => loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_BASE_URL: url }), error => /must be an HTTP/.test(error.message) && !error.message.includes('secret'))
  }
})
test('normalizes target and never loads backend credentials implicitly', () => {
  const config = loadAcceptanceConfig(env(), () => assert.fail('implicit file read'))
  assert.equal(config.base, 'http://127.0.0.1:49173/')
  assert.equal(config.credentials.student.username, 'student.demo')
  assert.equal(config.launchOptions.channel, 'chromium')
})
test('explicit credential file accepts BOM/CRLF/quotes, ignores database/provider secrets', () => {
  assert.deepEqual(parseCredentialsFile('\uFEFFLOCAL_STUDENT_PASSWORD="one=two"\r\n# comment\r\nLOCAL_TEACHER_PASSWORD=\'three\'\r\nDB_PASSWORD=private\r\nAI_API_KEY=private'), { LOCAL_STUDENT_PASSWORD: 'one=two', LOCAL_TEACHER_PASSWORD: 'three' })
  const config = loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_ENV_FILE: './explicit.env', BROWSER_ACCEPTANCE_TEACHER_PASSWORD: undefined }, () => 'LOCAL_TEACHER_PASSWORD=file-password')
  assert.equal(config.credentials.student.password, 'student-test-only')
  assert.equal(config.credentials.teacher.password, 'file-password')
})
test('missing or unreadable credentials fail without echoing file content', () => {
  assert.throws(() => loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_STUDENT_PASSWORD: undefined }), /missing student password/)
  assert.throws(() => loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_ENV_FILE: 'private-path' }, () => { throw new Error('sensitive details') }), error => !error.message.includes('sensitive') && !error.message.includes('private-path'))
})
test('requires different dedicated role accounts', () => {
  assert.throws(() => loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_STUDENT_USERNAME: 'same', BROWSER_ACCEPTANCE_TEACHER_USERNAME: 'same' }), /different dedicated/)
})
test('supports Linux browser executable and rejects ambiguous browser selection', () => {
  assert.deepEqual(loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_EXECUTABLE_PATH: '/usr/bin/chromium' }).launchOptions, { headless: true, executablePath: '/usr/bin/chromium' })
  assert.throws(() => loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_EXECUTABLE_PATH: '/usr/bin/chromium', BROWSER_ACCEPTANCE_CHANNEL: 'msedge' }), /either/)
  assert.throws(() => loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_EXECUTABLE_PATH: './chromium' }), /absolute/)
})
test('bounds configured timeouts', () => {
  assert.equal(loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_TIMEOUT_MS: '60000' }).timeout, 60000)
  for (const value of ['0', 'NaN', '999', '180001', '1000.5']) assert.throws(() => loadAcceptanceConfig({ ...env(), BROWSER_ACCEPTANCE_TIMEOUT_MS: value }), /timeout/)
})
test('fixture records run provenance and partial status but never passwords', () => {
  const config = loadAcceptanceConfig(env())
  const fixture = newFixture(config)
  assert.equal(fixture.result, 'IN_PROGRESS')
  assert.notEqual(fixture.runId, newFixture(config).runId)
  assert.equal(fixture.target, config.base)
  assert.ok(!JSON.stringify(fixture).includes('test-only'))
  assert.throws(() => validateFixture(fixture, config), /successful versioned/)
})
test('only a successful matching main run is accepted for boundary mutations', () => {
  const config = loadAcceptanceConfig(env())
  const fixture = successfulFixture(config)
  assert.equal(validateFixture(fixture, config), fixture)
  for (const changes of [{ schemaVersion: undefined }, { result: 'FAIL' }, { result: 'IN_PROGRESS' }, { runId: 'legacy-run' }]) assert.throws(() => validateFixture({ ...fixture, ...changes }, config), /successful versioned/)
  assert.throws(() => validateFixture({ ...fixture, target: 'http://elsewhere.test/' }, config), /target differs/)
  assert.throws(() => validateFixture({ ...fixture, accounts: { ...fixture.accounts, student: 'another' } }, config), /accounts differ/)
})
test('rejects malformed, duplicate or incomplete fixture IDs and naming', () => {
  const config = loadAcceptanceConfig(env()), fixture = successfulFixture(config)
  for (const changes of [{ offering: '../other' }, { chapter: null }, { assignments: [] }, { assignments: [fixture.assignments[0], fixture.assignments[0], fixture.assignments[2]] }, { prefix: 'ordinary production class' }, { calendarDate: 'invalid' }]) assert.throws(() => validateFixture({ ...fixture, ...changes }, config))
})
test('server records must match fixture identity, class, title and workspace type', () => {
  const fixture = successfulFixture()
  const offering = { id: fixture.offering, title: fixture.prefix }
  const assignments = fixture.assignments.map((id, index) => ({ id, offeringId: offering.id, title: fixture.prefix + ' ' + ['web_lab', 'sql_text', 'text'][index], type: ['web_lab', 'sql_text', 'text'][index] }))
  validateFixtureRecords(fixture, offering, assignments)
  for (const changes of [{ id: randomUUID() }, { offeringId: randomUUID() }, { title: 'unrelated existing task' }, { type: 'text' }]) assert.throws(() => validateFixtureRecords(fixture, offering, [{ ...assignments[0], ...changes }, ...assignments.slice(1)]), /no boundary mutations/)
  assert.throws(() => validateFixtureRecords(fixture, { ...offering, title: 'other' }, assignments), /no boundary mutations/)
})
test('both CLI entrypoints fail closed before importing Playwright or writing artifacts', () => {
  const output = join(tmpdir(), 'acceptance-refused-' + randomUUID())
  for (const name of ['verify-zhixue.mjs', 'verify-zhixue-boundaries.mjs']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { env: { BROWSER_ACCEPTANCE_OUTPUT_DIR: output }, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /BROWSER_ACCEPTANCE_BASE_URL/)
    assert.doesNotMatch(result.stderr, /Cannot find package|ERR_MODULE_NOT_FOUND/)
    assert.equal(existsSync(output), false)
  }
})
