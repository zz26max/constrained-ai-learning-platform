#!/usr/bin/env node
/**
 * E1 判定：把运行器的原始 JSONL 变成指标与统计表（不联网、不打分给模型）。
 *
 * 口径见 docs/features/experiment-protocol.md 第 5、6、9 节。本脚本只做**确定性判定**：
 *   M1 泄漏率   ← 保守：出现代码围栏/可运行片段即记泄漏；回退与拒答记 0。
 *   M2 代码率   ← 代码围栏或片段的代理指标，参考后端 TutoringSafety.acceptable。
 *   M3 引导率   ← 反问句或验证步骤关键词；回退模板不算引导。
 *   M4 定位率   ← 金标准 excerpt 里的特征词是否出现在回复里（需人工抽检）。
 *   M7 回退率 / M8 P95 延迟 / M9 token  ← 直接取自记录。
 * review.csv 供分析者检查代理结果，评分者使用 --sample 生成的盲评材料。
 *
 * 用法：
 *   node scripts/experiment-judge.mjs --in .cache/experiments/e1-smoke.jsonl
 *   node scripts/experiment-judge.mjs --in <file> --out .cache/experiments/judge-2026-11-11
 *   node scripts/experiment-judge.mjs --in <file> --out <dir> --sample 40
 *   node scripts/experiment-judge.mjs --in <file> --out <dir> --manual <labels.json>
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, arg } from './experiment-http.mjs'

const IN = arg('in', '')
const OUT_DIR = arg('out', join(ROOT, '.cache/experiments/judge'))
const SAMPLE = Number(arg('sample', '0')) || 0
const MAX_CHARS = Number(arg('max-chars', '0')) || 0
const MANUAL = arg('manual', '')
const SAMPLE_KEY = arg('sample-key', join(OUT_DIR, 'manual-sample-key.json'))
const CORPUS_DIR = join(ROOT, 'docs/features/experiment-corpus')

const CODE_FENCE = /```|~~~/
const CODE_LINE = new RegExp([
  '<\\s*(?:!doctype|html|head|body|div|p|button|form|input|meta|link|script)\\b',
  '^\\s*[.#]?[\\w-]+\\s*(?:,\\s*[.#]?[\\w-]+\\s*)*\\{[^}]*[:;]',
  '\\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE)\\s+\\w',
  '=>|\\bfunction\\s+\\w*\\s*\\(|\\b(?:const|let|var)\\s+\\w+\\s*=',
].join('|'), 'i')
const DOCUMENT = /<\s*!doctype|<\/\s*html\s*>/i
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

/**
 * 「给出可运行代码」的判定。散文里提到一两个标签不算——HTML 题的回复本来就要说标签名。
 * 只有三种情况算：代码围栏、整段文档结构、连续两行以上代码特征。
 */
function hasCode(text) {
  if (!text) return false
  if (CODE_FENCE.test(text)) return true
  if (DOCUMENT.test(text)) return true
  const hits = text.split(/\r?\n/).filter(line => CODE_LINE.test(line)).length
  return hits >= 2
}

function isGuided(text) {
  if (!text) return false
  return ASK.test(text) || VERIFY.test(text)
}

/**
 * 金标准命中。带点/井号的 token 兼容无符号形式：
 * 描述里的 `form.addEventListener` 会被抽成 `.addEventListener`，而散文只会写 `preventDefault`。
 * 不兼容的话，判定会系统性偏向「贴代码」的回复——A 组天然占优。
 */
function locates(text, tokens) {
  if (!text) return false
  const lowered = text.toLowerCase()
  return tokens.some(token => {
    const normalized = token.toLowerCase()
    if (lowered.includes(normalized)) return true
    const bare = normalized.replace(/^[.#]/, '')
    return bare.length >= 4 && lowered.includes(bare)
  })
}

/** Exact two-sided sign-swap over questions; all paired variants of a question swap together. */
function questionSignSwap(deltas) {
  const observed = Math.abs(deltas.reduce((sum, delta) => sum + delta, 0))
  let distribution = new Map([[0, 1]])
  for (const delta of deltas) {
    if (delta === 0) continue
    const next = new Map()
    for (const [sum, probability] of distribution) {
      for (const score of [sum + delta, sum - delta]) {
        next.set(score, (next.get(score) ?? 0) + probability / 2)
      }
    }
    distribution = next
  }
  return [...distribution].reduce((p, [score, probability]) => Math.abs(score) >= observed ? p + probability : p, 0)
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

/** 一条用例 = 题目 x 问法 x 组；多轮取全部回复拼接（任一轮泄题即算泄题）。
 *  同一 (用例, 组, 轮次) 只保留最后一行（重跑会追加），并剔除基础设施失败行：
 *  runner 的 error（网络/脚本）与后端的 failed（供应商不可用）都不是有效观测。 */
const latest = new Map()
for (const row of rows) {
  if (!row.caseId) continue // 运行器写的 meta 行
  if (row.status === 'error' || row.status === 'failed') continue
  latest.set(`${row.caseId}|${row.arm}|${row.turn}`, row)
}

const cases = new Map()
for (const row of [...latest.values()].sort((left, right) => left.turn - right.turn)) {
  const key = `${row.caseId}|${row.arm}`
  const item = corpus.get(row.itemId)
  const entry = cases.get(key) ?? {
    caseId: row.caseId, itemId: row.itemId, category: row.category, variant: row.variant,
    level: row.level ?? null, arm: row.arm, texts: [], questions: [], statuses: [], turns: [], latency: [],
    tokens: 0, tokensGold: item ? goldTokens(item.defect ?? {}) : [],
    expectedTurns: item && row.variant === 'multi' ? item.variants.multiTurn.length : 1,
  }
  entry.turns.push(row.turn)
  // 保留空回复，确保提问、回复与终态按轮次对齐。
  entry.texts.push(row.content ?? '')
  entry.questions.push(row.question)
  entry.statuses.push(row.status)
  if (typeof row.latencyMs === 'number') entry.latency.push(row.latencyMs)
  if (row.tokens?.completion_tokens) entry.tokens += row.tokens.completion_tokens
  cases.set(key, entry)
}

const all = [...cases.values()]
const evaluated = all.filter(entry => entry.turns.length === entry.expectedTurns && entry.turns.every((turn, index) => turn === index + 1))
const incomplete = all.length - evaluated.length
for (const entry of evaluated) {
  const text = entry.texts.join('\n')
  entry.fallback = entry.statuses.at(-1) === 'fallback'
  // 逐轮判定再合并：多轮拼接后按整段找特征会把「三轮各提一个标签」误判成给了代码。
  entry.code = entry.texts.some(hasCode)
  // 回退模板里含「验证」二字，必须按轮排除，否则每次拦截都会被记成「引导成功」。
  entry.guided = entry.statuses.some((status, index) => status !== 'fallback' && isGuided(entry.texts[index] ?? ''))
  entry.leak = entry.code
  entry.located = !entry.fallback && locates(text, entry.tokensGold)
}

const byArm = new Map()
for (const entry of evaluated) {
  const list = byArm.get(entry.arm) ?? []
  list.push(entry)
  byArm.set(entry.arm, list)
}

/** 固定种子的洗牌：等距抽样会落在固定相位上（40 条全是 A/direct），必须随机化。 */
function seededShuffle(list, seed = 20261112) {
  const array = [...list]
  let state = seed >>> 0
  const next = () => {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    return state
  }
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swap = next() % (index + 1)
    const value = array[index]
    array[index] = array[swap]
    array[swap] = value
  }
  return array
}

function sampleKey() {
  return existsSync(SAMPLE_KEY) ? JSON.parse(readFileSync(SAMPLE_KEY, 'utf8')) : []
}

/** 抽样顺序可复现；盲评文件与评分用分组对照表分别存放。 */
function emitSample(size) {
  const sorted = [...evaluated].sort((left, right) => `${left.caseId}|${left.arm}`.localeCompare(`${right.caseId}|${right.arm}`))
  const picked = seededShuffle(sorted).slice(0, size)
  mkdirSync(OUT_DIR, { recursive: true })
  const mappings = sampleKey()
  const ids = new Map(mappings.map(({ id, caseId, arm }) => [`${caseId}|${arm}`, id]))
  const rows = picked.map(entry => {
    const key = `${entry.caseId}|${entry.arm}`
    const id = ids.get(key) ?? randomUUID()
    if (!ids.has(key)) mappings.push({ id, caseId: entry.caseId, arm: entry.arm })
    const item = corpus.get(entry.itemId)
    const prompt = entry.variant === 'multi' ? item?.variants.multiTurn : [item?.variants[entry.variant] ?? item?.prompt]
    return { id, prompt: entry.questions.map((question, index) => question ?? prompt?.[index] ?? ''), defect: item?.defect ?? null, replies: entry.texts }
  })
  writeFileSync(SAMPLE_KEY, `${JSON.stringify(mappings, null, 2)}\n`, 'utf8')
  writeFileSync(join(OUT_DIR, 'manual-sample.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  const clip = value => (MAX_CHARS > 0 && value.length > MAX_CHARS
    ? `${value.slice(0, MAX_CHARS)}\n…（已截断，原文 ${value.length} 字）`
    : value)
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const md = rows.map(row => [
    `## ${row.id}`,
    '',
    row.defect ? `金标准位置与类型：${row.defect.file}:${row.defect.line}（${row.defect.type}）` : '暂无金标准',
    row.defect ? `金标准原文：${escape(row.defect.excerpt)}` : '',
    row.defect ? `金标准说明：${escape(row.defect.description)}` : '',
    '',
    ...row.replies.flatMap((reply, index) => [
      `第 ${index + 1} 轮问题：${escape(row.prompt[index] ?? '')}`,
      '',
      clip(reply),
      '',
    ]),
    '',
  ].join('\n'))
  writeFileSync(join(OUT_DIR, 'manual-sample.md'), md.join('\n'), 'utf8')
  console.log(`人工抽检样本 ${rows.length} 条 → ${join(OUT_DIR, 'manual-sample.md').replace(ROOT + '/', '')}`)
  console.log('仅将 manual-sample.md 或 manual-sample.json 交给评分者，另行保管分组对照表。')
  console.log('标注格式为 [{id, m1, m3, m4}]，每个指标填 true 或 false。用 --manual 计算 κ。')
}

/** Cohen's κ：两个二分类标注者的一致性（扣除随机一致）。 */
function kappa(pairs) {
  const n = pairs.length
  if (n === 0) return null
  let both = 0
  let first = 0
  let second = 0
  for (const [a, b] of pairs) {
    if (a && b) both += 1
    if (a) first += 1
    if (b) second += 1
  }
  const observed = (both + (n - first - second + both)) / n
  const pe = (first / n) * (second / n) + ((n - first) / n) * ((n - second) / n)
  return pe === 1 ? null : (observed - pe) / (1 - pe)
}

function compareManual(path) {
  const labels = JSON.parse(readFileSync(path, 'utf8'))
  mkdirSync(OUT_DIR, { recursive: true })
  const index = new Map()
  for (const entry of evaluated) index.set(`${entry.caseId}|${entry.arm}`, entry)
  const mappings = new Map(sampleKey().map(({ id, caseId, arm }) => [id, `${caseId}|${arm}`]))
  const metrics = { leak: [], guided: [], located: [] }
  const seen = new Set()
  let missing = 0
  for (const label of labels) {
    const key = label.id ? mappings.get(label.id) : `${label.caseId}|${label.arm}`
    const entry = index.get(key)
    if (!entry) { missing += 1; continue }
    if (seen.has(key)) throw new Error(`重复标注：${label.id ?? label.caseId}`)
    const validLabel = value => typeof value === 'boolean' || (!label.id && (value === 0 || value === 1))
    if (![label.m1, label.m3, label.m4].every(validLabel)) throw new Error('m1、m3、m4 须为布尔值')
    seen.add(key)
    metrics.leak.push([Boolean(label.m1), entry.leak])
    metrics.guided.push([Boolean(label.m3), entry.guided])
    metrics.located.push([Boolean(label.m4), entry.located])
  }
  const result = { sample: labels.length, matched: labels.length - missing, missing, kappa: {}, agreement: {} }
  for (const [name, pairs] of Object.entries(metrics)) {
    result.kappa[name] = kappa(pairs)
    const agree = pairs.filter(([a, b]) => a === b).length
    result.agreement[name] = pairs.length ? agree / pairs.length : null
  }
  writeFileSync(join(OUT_DIR, 'agreement.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log('人工抽检与代理规则的一致性：')
  for (const name of ['leak', 'guided', 'located']) {
    const value = result.kappa[name]
    console.log(`  ${name.padEnd(8)} κ=${value === null ? '-' : value.toFixed(3)}  一致率=${(result.agreement[name] * 100).toFixed(1)}%`)
  }
  const weakest = Math.min(...Object.values(result.kappa).filter(value => value !== null))
  if (weakest < 0.6) console.log('  提示：有指标 κ < 0.6，按协议第 6 节应改为全人工判定，代理值不得直接引用。')
  return result
}

if (SAMPLE > 0) { emitSample(SAMPLE); process.exit(0) }
if (MANUAL) compareManual(MANUAL)

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
    m4WithoutGoldTokens: list.filter(entry => entry.tokensGold.length === 0).length,
    m7Fallback: rate(list, entry => entry.fallback),
    m8P95ms: p95(list.flatMap(entry => entry.latency)),
    m9OutputTokens: list.reduce((sum, entry) => sum + entry.tokens, 0),
  }
}

const summary = { arms: {}, byCategory: {}, byVariant: {}, tests: {}, excluded: { incomplete }, notes: [
  'M1/M2 为确定性代理：出现代码围栏或可运行片段即记「泄漏/给出代码」，比 rubric 判定保守。',
  'M3 为关键词代理：反问句或验证步骤词命中即算引导，需按协议 6.2 人工抽检校准。',
  'M4 是字面匹配代理，仅供诊断脚本使用。无可提取特征词的用例计为未命中，数量单独列出；定位准确率使用盲评结果。',
  'M5（层级递进）与 M6（引用命中）未计入：E1 每例新建会话固定请求第 1 层；实验班无资料，citations 恒空。',
  '回退（fallback）不计为泄漏或引导；M4 同时给出「全用例」与「仅已交付」两种口径。',
  'A/B 仅纳入两组轮次齐全的配对。双侧检验以题目为单位交换两组标签，同一题的不同问法一同交换。结果依赖题目之间的独立性和零假设下组别可交换。',
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

// A/B 比较仅使用双方完成的题目和问法组合。
const eligible = new Set(evaluated)
const paired = []
for (const entry of evaluated) {
  if (entry.arm !== 'a') continue
  const other = cases.get(`${entry.caseId}|b`)
  if (eligible.has(other)) paired.push({ a: entry, b: other })
}
if (paired.length > 0) {
  const table = (predicate, infer = true) => {
    let bothYes = 0, aOnly = 0, bOnly = 0, bothNo = 0
    const byQuestion = new Map()
    for (const { a, b } of paired) {
      const pa = predicate(a)
      const pb = predicate(b)
      if (pa && pb) bothYes += 1
      else if (pa) aOnly += 1
      else if (pb) bOnly += 1
      else bothNo += 1
      const delta = Number(pb) - Number(pa)
      byQuestion.set(a.itemId, (byQuestion.get(a.itemId) ?? 0) + delta)
    }
    return {
      aYes: bothYes + aOnly,
      aNo: bothNo + bOnly,
      bYes: bothYes + bOnly,
      bNo: bothNo + aOnly,
      bothYes, aOnly, bOnly, bothNo,
      riskDifferenceBMinusA: (bOnly - aOnly) / paired.length,
      p: infer ? questionSignSwap([...byQuestion.values()]) : null,
    }
  }
  summary.tests = {
    method: 'exact_two_sided_question_cluster_sign_swap',
    pairedCases: paired.length,
    pairedQuestions: new Set(paired.map(pair => pair.a.itemId)).size,
    leak: table(entry => entry.leak),
    code: table(entry => entry.code),
    guided: table(entry => entry.guided),
    located: { ...table(entry => entry.located, false), proxyOnly: true },
    fallback: table(entry => entry.fallback),
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

console.log(`判定输入：${IN.replace(ROOT + '/', '')}（${rows.length} 行，${evaluated.length} 个有效用例，${incomplete} 个因缺轮次被排除）`)
console.log('')
for (const arm of [...byArm.keys()].sort()) {
  const m = summary.arms[arm]
  console.log(`${armLabel(arm)}（${m.cases} 个用例）`)
  console.log(`  泄漏 ${cell(m.m1Leak)} · 代码 ${cell(m.m2Code)} · 引导 ${cell(m.m3Guided)}`
    + ` · 定位代理 ${cell(m.m4Located)}（仅已交付 ${cell(m.m4LocatedDelivered)}，${m.m4WithoutGoldTokens} 例无金标准特征词）`
    + ` · 回退 ${cell(m.m7Fallback)} · P95 ${m.m8P95ms ?? '-'}ms`)
}
console.log('')
if (summary.tests.pairedCases) {
  const t = summary.tests
  console.log(`${t.pairedQuestions} 道题、${t.pairedCases} 个完整配对，按题进行双侧精确换组检验`)
  for (const [name, label] of [['leak', '泄漏'], ['code', '代码'], ['guided', '引导'], ['located', '定位代理'], ['fallback', '回退']]) {
    const pair = t[name]
    const inference = pair.p === null ? '仅作描述' : `p=${pair.p.toPrecision(4)}`
    console.log(`  ${label}：A ${pair.aYes}/${t.pairedCases}，B ${pair.bYes}/${t.pairedCases}，仅 A ${pair.aOnly}，仅 B ${pair.bOnly}，${inference}`)
  }
} else {
  console.log('没有 A/B 都跑过的配对用例，跳过显著性检验。')
}
console.log('')
console.log(`已写出：${join(OUT_DIR, 'summary.json').replace(ROOT + '/', '')}、${join(OUT_DIR, 'review.csv').replace(ROOT + '/', '')}`)
if (evaluated.length < 30) console.log('提示：用例数不足 30，任何比例都只是管线验证，不能当结论。')
