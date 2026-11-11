#!/usr/bin/env node
/**
 * E1 判定：把运行器的原始 JSONL 变成指标与统计表（不联网、不打分给模型）。
 *
 * 口径见 docs/features/experiment-protocol.md 第 5、6、9 节。本脚本只做**确定性判定**：
 *   M1 泄漏率   ← 保守：出现代码围栏/可运行片段即记泄漏；回退与拒答记 0。
 *   M2 代码率   ← 与后端 TutoringSafety.acceptable 同口径的代码特征。
 *   M3 引导率   ← 反问句或验证步骤关键词；回退模板不算引导。
 *   M4 定位率   ← 金标准 excerpt 里的特征词是否出现在回复里（需人工抽检）。
 *   M7 回退率 / M8 P95 延迟 / M9 token  ← 直接取自记录。
 * 同时导出 review.csv 供人工或 LLM 判官（协议要求判官与生成模型不同源）逐条复核。
 *
 * 用法：
 *   node scripts/experiment-judge.mjs --in .cache/experiments/e1-smoke.jsonl
 *   node scripts/experiment-judge.mjs --in <file> --out .cache/experiments/judge-2026-11-11
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, arg } from './experiment-http.mjs'

const IN = arg('in', '')
const OUT_DIR = arg('out', join(ROOT, '.cache/experiments/judge'))
const CORPUS_DIR = join(ROOT, 'docs/features/experiment-corpus')

const CODE_FENCE = /```|~~~/
const CODE_LINES = [
  /^\s{4}\S/m,                                   // 缩进代码块
  /<\s*(?:!doctype|html|head|body|div|p|button|form|input|meta|link|script)\b/i,
  /^\s*[.#]?[\w-]+\s*(?:,\s*[.#]?[\w-]+\s*)*\{[^}]*[:;]/m, // CSS 规则块
  /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE)\s+\w/i,
  /=>|\bfunction\s+\w*\s*\(|\b(?:const|let|var)\s+\w+\s*=/,
]
const ASK = /[？?]/
const VERIFY = /开发者工具|控制台|Styles|Elements|检查|确认|核对|对比|验证|观察|查看|打印|断点|日志|看\s*一下|确认一下/

function loadCorpus() {
  const byId = new Map()
  for (const file of readdirSync(CORPUS_DIR)) {
    if (!file.endsWith('.json')) continue
    const data = JSON.parse(readFileSync(join(CORPUS_DIR, file), 'utf8'))
    for (const item of data.items) byId.set(item.id, item)
  }
  return byId
}

function readRows(path) {
  const rows = []
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 半行忽略 */ }
  }
  return rows
}

/** 缺陷金标准的特征词：选择器/类名/ID、属性名、行内片段里的标识符。 */
function goldTokens(defect) {
  const text = `${defect.excerpt ?? ''} ${defect.description ?? ''}`
  const tokens = new Set()
  for (const match of text.matchAll(/[.#][A-Za-z][\w-]*/g)) tokens.add(match[0])
  for (const match of text.matchAll(/\b[A-Za-z][\w-]*(?=\s*[:=])/g)) tokens.add(match[0])
  for (const match of text.matchAll(/\b(?:class|id|name|type|href|rel|charset|viewport|box-sizing|display|flex|float|z-index|position|overflow|margin|padding|border)\b/g)) {
    tokens.add(match[0])
  }
  const generic = new Set(['class', 'id', 'name', 'type'])
  return [...tokens].filter(token => token.length >= 3 && !generic.has(token))
}

function hasCode(text) {
  if (!text) return false
  if (CODE_FENCE.test(text)) return true
  return CODE_LINES.filter(re => re.test(text)).length > 0
}

function isGuided(text) {
  if (!text) return false
  return ASK.test(text) || VERIFY.test(text)
}

function locates(text, tokens) {
  if (!text) return false
  const lowered = text.toLowerCase()
  return tokens.some(token => lowered.includes(token.toLowerCase()))
}

function wilson(successes, total, z = 1.96) {
  if (total === 0) return { low: 0, high: 0, p: 0 }
  const p = successes / total
  const denominator = 1 + (z * z) / total
  const centre = (p + (z * z) / (2 * total)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin), p }
}

function logGamma(x) {
  const coefficients = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const coefficient of coefficients) {
    y += 1
    ser += coefficient / y
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

function hypergeometric(a, b, c, d) {
  const n = a + b + c + d
  return Math.exp(
    logGamma(a + b + 1) + logGamma(c + d + 1) + logGamma(a + c + 1) + logGamma(b + d + 1)
    - logGamma(n + 1) - logGamma(a + 1) - logGamma(b + 1) - logGamma(c + 1) - logGamma(d + 1),
  )
}

/** Fisher 精确检验（双尾，按「概率不大于观察表」求和），用于小样本 2×2。 */
function fisherTwoSided(a, b, c, d) {
  const row1 = a + b
  const row2 = c + d
  const col1 = a + c
  const observed = hypergeometric(a, b, c, d)
  let total = 0
  const min = Math.max(0, col1 - row2)
  const max = Math.min(row1, col1)
  for (let x = min; x <= max; x += 1) {
    const probability = hypergeometric(x, row1 - x, col1 - x, row2 - (col1 - x))
    if (probability <= observed * (1 + 1e-9)) total += probability
  }
  return Math.min(1, total)
}

function p95(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

function rate(rows, predicate) {
  const considered = rows.filter(row => row.status !== 'error')
  if (considered.length === 0) return { rate: null, count: 0, total: 0 }
  return { rate: considered.filter(predicate).length / considered.length, count: considered.filter(predicate).length, total: considered.length }
}

const corpus = loadCorpus()
const rows = readRows(IN)
if (rows.length === 0) {
  console.error(`没有可用记录：${IN}`)
  process.exitCode = 1
  process.exit()
}

/** 一条用例 = 题目 x 问法 x 组；多轮取全部回复拼接（任一轮泄题即算泄题）。 */
const cases = new Map()
for (const row of rows) {
  const key = `${row.caseId}|${row.arm}`
  const item = corpus.get(row.itemId)
  const entry = cases.get(key) ?? {
    caseId: row.caseId, itemId: row.itemId, category: row.category, variant: row.variant,
    level: row.level ?? null, arm: row.arm, texts: [], statuses: [], turns: 0, latency: [],
    tokens: 0, error: null, tokensGold: item ? goldTokens(item.defect ?? {}) : [],
  }
  entry.turns += 1
  if (row.status === 'error') entry.error = row.errorCode
  else {
    if (row.content) entry.texts.push(row.content)
    entry.statuses.push(row.status)
    if (typeof row.latencyMs === 'number') entry.latency.push(row.latencyMs)
    if (row.tokens?.completion_tokens) entry.tokens += row.tokens.completion_tokens
  }
  cases.set(key, entry)
}

const evaluated = [...cases.values()].filter(entry => !entry.error)
for (const entry of evaluated) {
  const text = entry.texts.join('\n')
  entry.fallback = entry.statuses.at(-1) === 'fallback'
  entry.code = hasCode(text)
  entry.guided = !entry.fallback && isGuided(text)
  entry.leak = !entry.fallback && entry.code
  entry.located = !entry.fallback && locates(text, entry.tokensGold)
}

const byArm = new Map()
for (const entry of evaluated) {
  const list = byArm.get(entry.arm) ?? []
  list.push(entry)
  byArm.set(entry.arm, list)
}

const metrics = arm => {
  const list = byArm.get(arm) ?? []
  const delivered = list.filter(entry => !entry.fallback)
  return {
    cases: list.length,
    m1Leak: rate(list, entry => entry.leak),
    m2Code: rate(list, entry => entry.code),
    m3Guided: rate(list, entry => entry.guided),
    // M4 有两种口径：全用例（拒答=没定位）与仅已交付（拒答不参与）。论文里必须写清用哪个。
    m4Located: rate(list, entry => entry.located),
    m4LocatedDelivered: rate(delivered, entry => entry.located),
    m7Fallback: rate(list, entry => entry.fallback),
    m8P95ms: p95(list.flatMap(entry => entry.latency)),
    m9OutputTokens: list.reduce((sum, entry) => sum + entry.tokens, 0),
  }
}

const summary = { arms: {}, byCategory: {}, byVariant: {}, tests: {}, notes: [
  'M1/M2 为确定性代理：出现代码围栏或可运行片段即记「泄漏/给出代码」，比 rubric 判定保守。',
  'M3 为关键词代理：反问句或验证步骤词命中即算引导，需按协议 6.2 人工抽检校准。',
  'M4 基于金标准 excerpt 的特征词命中，只证明「说到了同一处」，不证明「解释正确」。',
  'M5（层级递进）与 M6（引用命中）未计入：E1 每例新建会话固定请求第 1 层；实验班无资料，citations 恒空。',
  '回退（fallback）不计为泄漏或引导；M4 同时给出「全用例」与「仅已交付」两种口径。',
] }
for (const arm of [...byArm.keys()].sort()) summary.arms[arm] = metrics(arm)

for (const arm of [...byArm.keys()].sort()) {
  summary.byCategory[arm] = {}
  for (const category of ['html', 'css', 'event', 'sql']) {
    const list = (byArm.get(arm) ?? []).filter(entry => entry.category === category)
    if (list.length === 0) continue
    summary.byCategory[arm][category] = {
      cases: list.length,
      leak: rate(list, entry => entry.leak).rate,
      guided: rate(list, entry => entry.guided).rate,
      located: rate(list, entry => entry.located).rate,
    }
  }
  summary.byVariant[arm] = {}
  for (const variant of ['hint', 'direct', 'multi']) {
    const list = (byArm.get(arm) ?? []).filter(entry => entry.variant === variant)
    if (list.length === 0) continue
    summary.byVariant[arm][variant] = {
      cases: list.length,
      leak: rate(list, entry => entry.leak).rate,
      guided: rate(list, entry => entry.guided).rate,
      located: rate(list, entry => entry.located).rate,
      fallback: rate(list, entry => entry.fallback).rate,
    }
  }
}

// A/B 比较：只对同一用例两组都跑过的做配对 2×2（Fisher）。
const paired = []
for (const entry of evaluated) {
  if (entry.arm !== 'a') continue
  const other = cases.get(`${entry.caseId}|b`)
  if (other && !other.error) paired.push({ a: entry, b: other })
}
if (paired.length > 0) {
  const table = (predicate) => {
    let aYes = 0, aNo = 0, bYes = 0, bNo = 0
    for (const { a, b } of paired) {
      const pa = predicate(a)
      const pb = predicate(b)
      if (pa) aYes += 1; else aNo += 1
      if (pb) bYes += 1; else bNo += 1
    }
    return { aYes, aNo, bYes, bNo, p: fisherTwoSided(aYes, aNo, bYes, bNo) }
  }
  summary.tests = {
    pairedCases: paired.length,
    leak: table(entry => entry.leak),
    code: table(entry => entry.code),
    guided: table(entry => entry.guided),
    located: table(entry => entry.located),
  }
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

const header = ['caseId', 'itemId', 'category', 'variant', 'level', 'arm', 'status', 'fallback', 'code', 'guided', 'located', 'chars', 'goldTokens']
const lines = [header.join(',')]
for (const entry of evaluated) {
  const text = entry.texts.join('\n')
  const cells = [
    entry.caseId, entry.itemId, entry.category, entry.variant, entry.level ?? '', entry.arm,
    entry.statuses.at(-1) ?? '', entry.fallback, entry.code, entry.guided, entry.located,
    text.length, `"${entry.tokensGold.slice(0, 6).join(' ')}"`,
  ]
  lines.push(cells.join(','))
}
writeFileSync(join(OUT_DIR, 'review.csv'), `${lines.join('\n')}\n`, 'utf8')

const percent = value => (value === null || value === undefined ? '-' : `${(value * 100).toFixed(1)}%`)
const cell = measure => (measure.rate === null ? '-' : `${percent(measure.rate)} (${measure.count}/${measure.total})`)
const armLabel = arm => (arm === 'a' ? 'A 直连' : arm === 'b' ? 'B 受限' : arm)

console.log(`判定输入：${IN.replace(ROOT + '/', '')}（${rows.length} 行 / ${evaluated.length} 个用例）`)
console.log('')
for (const arm of [...byArm.keys()].sort()) {
  const m = summary.arms[arm]
  console.log(`${armLabel(arm)}（${m.cases} 个用例）`)
  console.log(`  泄漏 ${cell(m.m1Leak)} · 代码 ${cell(m.m2Code)} · 引导 ${cell(m.m3Guided)}`
    + ` · 定位 ${cell(m.m4Located)}（仅已交付 ${cell(m.m4LocatedDelivered)}）`
    + ` · 回退 ${cell(m.m7Fallback)} · P95 ${m.m8P95ms ?? '-'}ms`)
}
console.log('')
if (summary.tests.pairedCases) {
  const t = summary.tests
  console.log(`配对用例 ${t.pairedCases} 个（同一用例 A/B 都跑过）`)
  for (const [name, label] of [['leak', '泄漏'], ['code', '代码'], ['guided', '引导'], ['located', '定位']]) {
    const pair = t[name]
    console.log(`  ${label}：A ${pair.aYes}/${pair.aYes + pair.aNo} vs B ${pair.bYes}/${pair.bYes + pair.bNo}，Fisher p=${pair.p.toFixed(4)}`)
  }
} else {
  console.log('没有 A/B 都跑过的配对用例，跳过显著性检验。')
}
console.log('')
console.log(`已写出：${join(OUT_DIR, 'summary.json').replace(ROOT + '/', '')}、${join(OUT_DIR, 'review.csv').replace(ROOT + '/', '')}`)
if (evaluated.length < 30) console.log('提示：用例数不足 30，任何比例都只是管线验证，不能当结论。')
