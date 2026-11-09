#!/usr/bin/env node
// 只读实验数据导出：从开发库读取「每生每作业」与「每次辅导请求」两类事实，写成 CSV。
// 不读取 backend/.env，不接受任意 SQL，只做 SELECT；凭据由容器内已有的 MYSQL_ROOT_PASSWORD 提供。
//
// 用法：
//   node scripts/experiment-export.mjs --offering <教学班 UUID> [--out .cache/experiments] [--container learning-platform-dev-db-1] [--database learning_platform]
//   node scripts/experiment-export.mjs --self-test
//
// 口径见 docs/features/experiment-protocol.md 第 8 节。

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

export function parseArgs(argv) {
  const options = {
    offering: null,
    out: '.cache/experiments',
    container: 'learning-platform-dev-db-1',
    database: 'learning_platform',
    selfTest: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = () => {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(`${flag} 需要一个值`)
      index += 1
      return next
    }
    if (flag === '--offering') options.offering = value()
    else if (flag === '--out') options.out = value()
    else if (flag === '--container') options.container = value()
    else if (flag === '--database') options.database = value()
    else if (flag === '--self-test') options.selfTest = true
    else if (flag === '--help' || flag === '-h') options.help = true
    else throw new Error(`未知参数：${flag}`)
  }
  return options
}

export function assertReadOnly(sql) {
  const text = String(sql).trim()
  if (!/^select\b/i.test(text)) throw new Error('只允许 SELECT 查询')
  if (/;\s*\S/.test(text)) throw new Error('只允许单条语句')
  if (/\b(insert|update|delete|replace|alter|drop|create|truncate|grant|set\s+\w+\s*=)\b/i.test(text.replace(/'[^']*'/g, "''"))) {
    throw new Error('检测到写操作关键字，拒绝执行')
  }
  return text
}

export function quoteUuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${label} 必须是 UUID`)
  return `'${value}'`
}

export function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(columns, rows) {
  const header = columns.join(',')
  const body = rows.map((row) => columns.map((name) => csvCell(row[name])).join(','))
  return [header, ...body].join('\r\n') + '\r\n'
}

export function buildAssignmentSql(offeringId) {
  const id = quoteUuid(offeringId, '--offering')
  return assertReadOnly(`
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'offering_id', '${offeringId}',
  'student', t.username,
  'display_name', t.display_name,
  'assignment_id', t.assignment_id,
  'assignment_title', t.title,
  'assignment_type', t.type,
  'chapter_id', t.chapter_id,
  'max_delivered_hint_level', t.max_hint,
  'tutoring_completed', t.completed_requests,
  'tutoring_fallback', t.fallback_requests,
  'tutoring_failed', t.failed_requests,
  'max_requested_hint_level', t.max_requested,
  'workspace_revision', t.workspace_revision,
  'attempt_count', t.attempt_count,
  'first_submitted_at_utc', t.first_submitted_at,
  'last_submitted_at_utc', t.last_submitted_at,
  'check_total', t.check_total,
  'check_completed', t.check_completed
)), JSON_ARRAY()) AS payload
FROM (
  SELECT u.username, u.display_name, a.id AS assignment_id, a.title, a.type, a.chapter_id,
         COALESCE(p.highest_delivered_hint_level, 0) AS max_hint,
         COALESCE(r.completed_requests, 0) AS completed_requests,
         COALESCE(r.fallback_requests, 0) AS fallback_requests,
         COALESCE(r.failed_requests, 0) AS failed_requests,
         r.max_requested,
         COALESCE(w.revision, 0) AS workspace_revision,
         COALESCE(s.attempt_count, 0) AS attempt_count,
         s.first_submitted_at, s.last_submitted_at,
         COALESCE(c.check_total, 0) AS check_total,
         COALESCE(c.check_completed, 0) AS check_completed
  FROM assignments a
  JOIN offering_members m ON m.offering_id = a.offering_id AND m.role = 'student' AND m.status = 'active'
  JOIN users u ON u.id = m.user_id
  LEFT JOIN tutoring_progress p ON p.assignment_id = a.id AND p.student_id = u.id
  LEFT JOIN (
    SELECT assignment_id, student_id,
           SUM(status = 'completed') AS completed_requests,
           SUM(status = 'fallback') AS fallback_requests,
           SUM(status = 'failed') AS failed_requests,
           MAX(hint_level) AS max_requested
    FROM tutoring_requests
    WHERE assignment_id IN (SELECT id FROM assignments WHERE offering_id = ${id})
    GROUP BY assignment_id, student_id
  ) r ON r.assignment_id = a.id AND r.student_id = u.id
  LEFT JOIN workspaces w ON w.assignment_id = a.id AND w.student_id = u.id
  LEFT JOIN (
    SELECT assignment_id, student_id, COUNT(*) AS attempt_count,
           MIN(submitted_at) AS first_submitted_at, MAX(submitted_at) AS last_submitted_at
    FROM submissions
    GROUP BY assignment_id, student_id
  ) s ON s.assignment_id = a.id AND s.student_id = u.id
  LEFT JOIN (
    SELECT assignment_id, student_id, COUNT(*) AS check_total,
           SUM(status = 'completed') AS check_completed
    FROM assignment_checks
    GROUP BY assignment_id, student_id
  ) c ON c.assignment_id = a.id AND c.student_id = u.id
  WHERE a.offering_id = ${id} AND a.status IN ('published', 'archived')
) t
`)
}

export function buildRequestSql(offeringId) {
  const id = quoteUuid(offeringId, '--offering')
  return assertReadOnly(`
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT(
  'offering_id', '${offeringId}',
  'student', t.username,
  'assignment_id', t.assignment_id,
  'assignment_title', t.assignment_title,
  'action', t.action,
  'requested_hint_level', t.hint_level,
  'status', t.status,
  'fallback_reason', t.fallback_reason,
  'error_code', t.error_code,
  'provider_calls', t.provider_call_count,
  'input_tokens', t.input_tokens,
  'output_tokens', t.output_tokens,
  'created_at_utc', t.created_at,
  'completed_at_utc', t.completed_at,
  'latency_ms', t.latency_ms
)), JSON_ARRAY()) AS payload
FROM (
  SELECT u.username, r.assignment_id, a.title AS assignment_title, r.action, r.hint_level, r.status,
         r.fallback_reason, r.error_code, r.provider_call_count, r.input_tokens, r.output_tokens,
         r.created_at, r.completed_at,
         CASE WHEN r.completed_at IS NULL THEN NULL
              ELSE ROUND(TIMESTAMPDIFF(MICROSECOND, r.created_at, r.completed_at) / 1000, 1) END AS latency_ms
  FROM tutoring_requests r
  JOIN assignments a ON a.id = r.assignment_id
  JOIN users u ON u.id = r.student_id
  WHERE a.offering_id = ${id}
) t
`)
}

export function parseMysqlJson(stdout) {
  const text = String(stdout).trim()
  if (text === '' || text === 'NULL') return []
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`返回内容不是合法 JSON（可能触发了 docker/mysql 报错）：${text.slice(0, 200)}`)
  }
  if (parsed === null) return []
  if (!Array.isArray(parsed)) throw new Error('期望 JSON 数组')
  return parsed
}

export function runQuery({ container, database, sql }, runner = execFileSync) {
  if (!SAFE_NAME.test(container)) throw new Error('容器名不合法')
  if (!SAFE_NAME.test(database)) throw new Error('数据库名不合法')
  const command = `MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot -N -B --default-character-set=utf8mb4 ${database}`
  const stdout = runner('docker', ['exec', '-i', container, 'sh', '-c', command], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return parseMysqlJson(stdout)
}

const ASSIGNMENT_COLUMNS = [
  'offering_id', 'student', 'display_name', 'assignment_id', 'assignment_title', 'assignment_type', 'chapter_id',
  'max_delivered_hint_level', 'tutoring_completed', 'tutoring_fallback', 'tutoring_failed', 'max_requested_hint_level',
  'workspace_revision', 'attempt_count', 'first_submitted_at_utc', 'last_submitted_at_utc', 'check_total', 'check_completed',
]
const REQUEST_COLUMNS = [
  'offering_id', 'student', 'assignment_id', 'assignment_title', 'action', 'requested_hint_level', 'status',
  'fallback_reason', 'error_code', 'provider_calls', 'input_tokens', 'output_tokens',
  'created_at_utc', 'completed_at_utc', 'latency_ms',
]

function timestampForPath(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

const HELP = `只读导出实验数据（口径见 docs/features/experiment-protocol.md 第 8 节）

  node scripts/experiment-export.mjs --offering <UUID> [选项]
  node scripts/experiment-export.mjs --self-test

选项
  --offering <UUID>        必填，教学班 ID
  --out <目录>             证据目录，默认 .cache/experiments（已被 Git 忽略）
  --container <名称>       开发库容器，默认 learning-platform-dev-db-1
  --database <名称>        库名，默认 learning_platform
  --self-test              不连数据库，自检 CSV、参数与只读防护
`

export function selfTest() {
  const failures = []
  const check = (name, run) => {
    try {
      run()
    } catch (error) {
      failures.push(`${name}: ${error.message}`)
    }
  }
  check('csv 引号与逗号', () => {
    const csv = toCsv(['a', 'b'], [{ a: 'x,y', b: 'he said "ok"' }])
    if (csv !== 'a,b\r\n"x,y","he said ""ok"""\r\n') throw new Error(csv)
  })
  check('空值渲染为空字段', () => {
    if (toCsv(['a', 'b'], [{ a: null, b: undefined }]) !== 'a,b\r\n,\r\n') throw new Error('空值未按空字段处理')
  })
  check('拒绝写语句', () => {
    let rejected = 0
    for (const sql of ['DELETE FROM users', 'UPDATE users SET a=1', 'SELECT 1; DROP TABLE users']) {
      try { assertReadOnly(sql) } catch { rejected += 1 }
    }
    if (rejected !== 3) throw new Error(`未全部拒绝：${rejected}/3`)
  })
  check('拒绝非法 offering', () => {
    try { quoteUuid("1' OR '1'='1", '--offering') } catch { return }
    throw new Error('未拒绝注入串')
  })
  check('SQL 覆盖两张导出表', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const cases = [
      ['assignment', buildAssignmentSql(id), ['FROM assignments', 'FROM submissions', 'FROM assignment_checks']],
      ['request', buildRequestSql(id), ['FROM tutoring_requests', 'JOIN assignments', 'tutoring_requests']],
    ]
    for (const [name, sql, keywords] of cases) {
      for (const keyword of [...keywords, id]) if (!sql.includes(keyword)) throw new Error(`${name} 缺少 ${keyword}`)
    }
  })
  check('解析 mysql JSON 输出', () => {
    if (parseMysqlJson('NULL\n').length !== 0) throw new Error('NULL 未解析为空数组')
    if (parseMysqlJson('[{"a":1}]\n').length !== 1) throw new Error('数组解析失败')
  })
  check('参数解析', () => {
    const options = parseArgs(['--offering', '11111111-1111-4111-8111-111111111111', '--out', 'x'])
    if (options.offering !== '11111111-1111-4111-8111-111111111111' || options.out !== 'x') throw new Error('参数未生效')
    let rejected = false
    try { parseArgs(['--offering']) } catch { rejected = true }
    if (!rejected) throw new Error('缺值未报错')
  })
  if (failures.length) {
    console.error(`SELFTEST FAIL (${failures.length})`)
    for (const failure of failures) console.error(`  - ${failure}`)
    return 1
  }
  console.log('SELFTEST PASS: 7 项检查（CSV 转义、空值、只读防护、注入防护、SQL 覆盖、JSON 解析、参数解析）')
  return 0
}

export function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(error.message)
    console.error(HELP)
    return 2
  }
  if (options.help) {
    console.log(HELP)
    return 0
  }
  if (options.selfTest) return selfTest()
  if (!options.offering) {
    console.error('缺少 --offering <教学班 UUID>')
    console.error(HELP)
    return 2
  }

  let assignmentRows
  let requestRows
  try {
    assertReadOnly(buildAssignmentSql(options.offering))
    assignmentRows = runQuery({ ...options, sql: buildAssignmentSql(options.offering) })
    requestRows = runQuery({ ...options, sql: buildRequestSql(options.offering) })
  } catch (error) {
    console.error(`导出失败：${error.message}`)
    return 1
  }

  const directory = resolve(options.out, options.offering, timestampForPath())
  mkdirSync(directory, { recursive: true })
  const assignmentCsv = toCsv(ASSIGNMENT_COLUMNS, assignmentRows)
  const requestCsv = toCsv(REQUEST_COLUMNS, requestRows)
  writeFileSync(join(directory, 'student-assignment.csv'), assignmentCsv, 'utf8')
  writeFileSync(join(directory, 'tutoring-requests.csv'), requestCsv, 'utf8')
  writeFileSync(join(directory, 'export.json'), JSON.stringify({
    exportedAt: new Date().toISOString(),
    offeringId: options.offering,
    container: options.container,
    database: options.database,
    rows: { studentAssignment: assignmentRows.length, tutoringRequests: requestRows.length },
    columns: { studentAssignment: ASSIGNMENT_COLUMNS, tutoringRequests: REQUEST_COLUMNS },
    source: 'read-only SELECT via docker exec; 口径见 docs/features/experiment-protocol.md 第 8 节',
  }, null, 2), 'utf8')

  console.log(`OK: ${assignmentRows.length} 行学生×作业，${requestRows.length} 行辅导请求`)
  console.log(`输出目录：${directory}`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
