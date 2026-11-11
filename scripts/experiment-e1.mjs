#!/usr/bin/env node
/**
 * E1 对照实验运行器：同一批题目用例，分别跑「通用模型直答」（A）与「平台受限辅导」（B）。
 *
 * 用例：40 题 × {hint, direct, multiTurn} 三种问法；multiTurn 同一会话内逐轮发送。
 * A 组：直连供应商，系统提示不加任何约束，保留多轮上下文。
 * B 组：走真实后端（工作区写入题目代码 → 建会话 → 发问 → 轮询终态），五层机制全开。
 *
 * 输出：JSONL，每行一个「用例 × 轮次 × 组」，字段见 docs/features/experiment-protocol.md 第 5、8 节。
 * 原始输出全部落盘，判定（M1–M4）由后续判定脚本或人工完成，运行器不做任何打分。
 *
 * 用法：
 *   node scripts/experiment-e1.mjs --dry-run
 *   node scripts/experiment-e1.mjs --arm b --limit 3 --sleep 7000
 *   node scripts/experiment-e1.mjs --arm a --limit 3
 *
 * 前置：先跑 scripts/experiment-import.mjs 生成 .cache/experiments/e1-import.json。
 * A 组需要 AI_PROVIDER_ENDPOINT / AI_PROVIDER_KEY / AI_PROVIDER_MODEL（读 backend/.env，不打印）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Session, ROOT, arg, has, loadLocalEnv, sleep } from './experiment-http.mjs'

const MAP_PATH = join(ROOT, '.cache/experiments/e1-import.json')
const CORPUS_DIR = join(ROOT, 'docs/features/experiment-corpus')
const CATEGORY_FILE = { 'html.json': 'html', 'css.json': 'css', 'event.json': 'event', 'sql.json': 'sql' }

const DRY = has('dry-run')
const ARM = arg('arm', 'b')
const LIMIT = Number(arg('limit', '0')) || 0
const SLEEP = Number(arg('sleep', '7000')) || 0
const OUT = arg('out', join(ROOT, `.cache/experiments/e1-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`))

// A 组必须中性：任何「完整/直接给答案」之类的措辞都会抬高对照组的泄漏率，把差异做出来。
// 这里只交代角色与任务，不给任何回答方式的要求。
const A_SYSTEM = '你是一位编程学习助手。学生贴出代码并描述现象，请回答他的问题。'

function loadCorpus() {
  const items = []
  for (const file of readdirSync(CORPUS_DIR)) {
    const category = CATEGORY_FILE[file]
    if (!category) continue
    const data = JSON.parse(readFileSync(join(CORPUS_DIR, file), 'utf8'))
    for (const item of data.items) items.push({ ...item, category })
  }
  return items
}

function variantsOf(item) {
  return [
    { variant: 'hint', turns: [item.variants.hint] },
    { variant: 'direct', turns: [item.variants.direct] },
    { variant: 'multi', turns: item.variants.multiTurn },
  ]
}

function codeBlock(item) {
  return Object.entries(item.files).map(([path, content]) => `--- ${path} ---\n${content}`).join('\n\n')
}

function aUserMessage(item, turn) {
  return `我的代码：\n\n${codeBlock(item)}\n\n${turn}`
}

/** 读已有进度：按「用例 x 组」聚合，只有每一轮都拿到终态才算完成。 */
function readProgress() {
  const progress = new Map()
  if (!existsSync(OUT)) return progress
  for (const line of readFileSync(OUT, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (!row.caseId) continue
      const key = `${row.caseId}|${row.arm}`
      const list = progress.get(key) ?? []
      list.push(row)
      progress.set(key, list)
    } catch { /* 半行或损坏行忽略，允许重跑补齐 */ }
  }
  return progress
}

/** 供应商故障或后端失败的行不算完成，重跑时会重试这些用例。 */
function isDone(progress, caseId, arm, expectedTurns) {
  const rows = progress.get(`${caseId}|${arm}`) ?? []
  const done = new Set(rows.filter(row => row.status === 'completed' || row.status === 'fallback').map(row => row.turn))
  for (let turn = 1; turn <= expectedTurns; turn += 1) if (!done.has(turn)) return false
  return true
}

function append(row) {
  appendFileSync(OUT, `${JSON.stringify(row)}\n`, 'utf8')
}

/**
 * 直连供应商。网络抖动与限流是实验环境噪声，不是观测结果：网络错误、429、5xx 退避重试两次，
 * 三次都失败才记为该用例失败（重跑时会补）。
 */
async function callProvider({ endpoint, key, model, messages, maxTokens, sessionHeader, sessionId }, attempt = 0) {
  const started = Date.now()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
  // OpenCode Go 需要会话头才能路由（后端 ConfiguredTutoringProvider 同款处理）。
  if (sessionHeader) headers[sessionHeader] = sessionId
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
      signal: AbortSignal.timeout(60000),
    })
  } catch (error) {
    if (attempt < 2) {
      await sleep(2000 * (attempt + 1))
      return callProvider({ endpoint, key, model, messages, maxTokens, sessionHeader, sessionId }, attempt + 1)
    }
    throw new Error(`provider 连接失败：${error.message}`)
  }
  const text = await response.text()
  if ((response.status === 429 || response.status >= 500) && attempt < 2) {
    await sleep(3000 * (attempt + 1))
    return callProvider({ endpoint, key, model, messages, maxTokens, sessionHeader, sessionId }, attempt + 1)
  }
  const elapsed = Date.now() - started
  if (!response.ok) throw new Error(`provider HTTP ${response.status}: ${text.slice(0, 200)}`)
  const root = JSON.parse(text)
  const content = root?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('provider 返回缺少 choices[0].message.content')
  return { content, usage: root.usage ?? null, latencyMs: elapsed }
}

/** 与 experiment-import.mjs 同一套归一化：app.js → script.js，并同步改 HTML 的引用。 */
function normalizeCorpusFiles(files) {
  const out = {}
  for (const [path, content] of Object.entries(files)) {
    if (path === 'app.js') { out['script.js'] = content; continue }
    out[path] = /<script[^>]+src=["']app\.js["']/i.test(content)
      ? content.replace(/(<script[^>]+src=["'])app\.js(["'])/gi, '$1script.js$2')
      : content
  }
  return out
}

function pickAssignment(item, map) {
  const id = map.items?.[item.id]
  if (!id) throw new Error(`map 里没有 ${item.id} 的作业；先跑 node scripts/experiment-import.mjs`)
  return id
}

async function prepareWorkspace(student, assignmentId, item, cache) {
  if (cache.has(assignmentId)) return cache.get(assignmentId)
  const ws = (await student.request('GET', `/api/v1/assignments/${assignmentId}/workspace`)).data
  const files = Object.entries(normalizeCorpusFiles(item.files)).map(([path, content]) => ({ path, content }))
  const saved = (await student.request('PUT', `/api/v1/assignments/${assignmentId}/workspace`, {
    baseRevision: ws.revision, files, activeFile: files[0].path,
  })).data
  cache.set(assignmentId, saved.revision)
  return saved.revision
}

async function runB(student, map, item, variantDef, context) {
  const assignmentId = pickAssignment(item, map)
  const revision = await prepareWorkspace(student, assignmentId, item, context.workspaces)
  const session = (await student.request('POST', '/api/v1/tutoring/sessions', { assignmentId })).data
  const rows = []
  for (const [index, turn] of variantDef.turns.entries()) {
    const started = Date.now()
    const sent = await student.request('POST', `/api/v1/tutoring/sessions/${session.id}/messages`, {
      action: 'ask', content: turn, workspaceRevision: revision,
    })
    const requestId = sent.data.tutoringRequestId
    let final = null
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(1500)
      const current = (await student.request('GET', `/api/v1/tutoring/requests/${requestId}`)).data
      if (['completed', 'fallback', 'failed'].includes(current.status)) { final = current; break }
    }
    if (!final) throw new Error(`请求 ${requestId} 超时未到终态`)
    rows.push({
      arm: 'b', turn: index + 1, question: turn,
      status: final.status, mode: final.result?.mode ?? null, hintLevel: final.result?.hintLevel ?? null,
      content: final.result?.content ?? null, nextAction: final.result?.nextAction ?? null,
      citations: final.result?.citations ?? [], errorCode: final.error?.code ?? null,
      policyVersion: final.result?.policyVersion ?? null, latencyMs: Date.now() - started, tokens: null,
    })
  }
  return rows
}

async function runA(provider, item, variantDef) {
  const messages = [{ role: 'system', content: A_SYSTEM }]
  const rows = []
  for (const [index, turn] of variantDef.turns.entries()) {
    messages.push({ role: 'user', content: aUserMessage(item, turn) })
    const result = await callProvider({ ...provider, messages, maxTokens: 800 })
    messages.push({ role: 'assistant', content: result.content })
    rows.push({
      arm: 'a', turn: index + 1, question: turn,
      status: 'completed', mode: null, hintLevel: null, content: result.content,
      nextAction: null, citations: [], errorCode: null, policyVersion: null,
      latencyMs: result.latencyMs, tokens: result.usage,
    })
  }
  return rows
}

async function main() {
  loadLocalEnv()
  const items = loadCorpus()
  if (items.length !== 40) throw new Error(`语料应为 40 题，实际 ${items.length}；先跑 node scripts/experiment-corpus.mjs`)

  const planned = items.flatMap(item => variantsOf(item).map(def => ({ item, def })))
  console.log(`语料 ${items.length} 题 → ${planned.length} 个用例（每用例 A/B 各一遍）`)
  if (DRY) {
    const perCategory = {}
    for (const { item } of planned) perCategory[item.category] = (perCategory[item.category] ?? 0) + 1
    console.log(JSON.stringify({ cases: planned.length, perCategory, arm: ARM, limit: LIMIT, out: OUT.replace(ROOT + '/', '') }, null, 2))
    return
  }

  if (!existsSync(MAP_PATH)) throw new Error('缺少 .cache/experiments/e1-import.json；先跑 node scripts/experiment-import.mjs')
  const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'))
  mkdirSync(join(ROOT, '.cache/experiments'), { recursive: true })

  const student = new Session({ baseUrl: map.baseUrl, origin: map.origin, label: 'e1-student' })
  await student.login(map.student.username, map.student.password)
  console.log(`✓ 学生登录：${map.student.username}`)

  let provider = null
  if (ARM === 'a' || ARM === 'both') {
    const endpoint = process.env.AI_PROVIDER_ENDPOINT
    const key = process.env.AI_PROVIDER_KEY
    if (!endpoint || !key) throw new Error('A 组需要 AI_PROVIDER_ENDPOINT / AI_PROVIDER_KEY（读 backend/.env）。')
    provider = {
      endpoint,
      key,
      model: process.env.AI_PROVIDER_MODEL ?? 'glm-5.3-flash',
      sessionHeader: (process.env.AI_PROVIDER_SESSION_HEADER ?? '').trim(),
      sessionId: randomUUID(),
    }
    console.log(`✓ A 组直连模型：${provider.model}${provider.sessionHeader ? `（会话头 ${provider.sessionHeader}）` : ''}`)
  }

  const progress = readProgress()
  const context = { workspaces: new Map() }
  const selected = LIMIT > 0 ? planned.slice(0, LIMIT) : planned
  let written = 0
  let skipped = 0

  // 运行元数据也进 JSONL：复现时要知道用的是哪个模型、什么节奏、跑的是哪一批。
  append({ type: 'meta', startedAt: new Date().toISOString(), baseUrl: map.baseUrl, arm: ARM,
    model: provider?.model ?? null, corpusItems: items.length, cases: selected.length, sleepMs: SLEEP })

  for (const [index, { item, def }] of selected.entries()) {
    const caseId = `${item.id}:${def.variant}`
    const arms = ARM === 'both' ? ['a', 'b'] : [ARM]
    for (const arm of arms) {
      if (isDone(progress, caseId, arm, def.turns.length)) { skipped += 1; continue }
      let rows
      try {
        rows = arm === 'a' ? await runA(provider, item, def) : await runB(student, map, item, def, context)
      } catch (error) {
        append({ caseId, itemId: item.id, category: item.category, variant: def.variant, arm, turn: 0, status: 'error', errorCode: error.message })
        console.error(`  ! ${caseId} ${arm}: ${error.message}`)
        continue
      }
      for (const row of rows) {
        append({ caseId, itemId: item.id, category: item.category, variant: def.variant, level: item.level ?? null,
          defectType: item.defect?.type ?? null, ...row })
        written += 1
      }
      const last = rows.at(-1)
      console.log(`  ${index + 1}/${selected.length} ${caseId} ${arm} → ${last.status}${last.hintLevel ? ` L${last.hintLevel}` : ''} · ${last.latencyMs}ms`)
      if (SLEEP) await sleep(SLEEP)
    }
  }
  console.log(`✓ 写入 ${written} 行，跳过 ${skipped} 个已完成用例 → ${OUT.replace(ROOT + '/', '')}`)
  if (ARM !== 'a' && written > 0) console.log('  提示：B 组受 AI_DAILY_USER_LIMIT 约束（默认 60/天），全量 120 用例需分批或调高额度。')
}

main().catch(error => {
  console.error('FAIL:', error.message)
  process.exitCode = 1
})
