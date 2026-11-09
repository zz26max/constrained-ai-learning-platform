#!/usr/bin/env node
// 实验语料校验：结构、行号金标准、问法完整性。只读本地 JSON，不联网、不写文件。
//
// 用法：
//   node scripts/experiment-corpus.mjs [--dir docs/features/experiment-corpus]
//   node scripts/experiment-corpus.mjs --self-test

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_DIR = 'docs/features/experiment-corpus'
const CATEGORIES = ['html', 'css', 'event', 'sql']
const ID_PATTERN = /^(html|css|event|sql)-(\d{3})$/

export function parseArgs(argv) {
  const options = { dir: DEFAULT_DIR, selfTest: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--self-test') options.selfTest = true
    else if (flag === '--help' || flag === '-h') options.help = true
    else if (flag === '--dir') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error('--dir 需要一个目录')
      index += 1
      options.dir = value
    } else throw new Error(`未知参数：${flag}`)
  }
  return options
}

export function validateFile(name, data) {
  const errors = []
  const fail = message => errors.push(`${name}: ${message}`)
  const category = name.replace(/\.json$/, '')
  if (!CATEGORIES.includes(category)) return [`${name}: 未知类别，只允许 ${CATEGORIES.join('/')}`]
  if (data?.schemaVersion !== 1) fail('schemaVersion 必须为 1')
  if (data?.category !== category) fail(`category 应为 ${category}`)
  if (!Array.isArray(data?.items) || data.items.length === 0) {
    fail('items 必须是非空数组')
    return errors
  }
  const seen = new Set()
  data.items.forEach((item, index) => {
    const where = `items[${index}]${item?.id ? `(${item.id})` : ''}`
    if (typeof item?.id !== 'string' || !ID_PATTERN.test(item.id)) fail(`${where}: id 需形如 ${category}-001`)
    else {
      if (!item.id.startsWith(category + '-')) fail(`${where}: id 前缀与文件类别不一致`)
      if (seen.has(item.id)) fail(`${where}: id 重复`)
      seen.add(item.id)
    }
    if (typeof item?.title !== 'string' || item.title.trim() === '') fail(`${where}: 缺少 title`)
    if (typeof item?.prompt !== 'string' || item.prompt.trim() === '') fail(`${where}: 缺少 prompt`)
    if (!item?.files || typeof item.files !== 'object' || Object.keys(item.files).length === 0) fail(`${where}: files 不能为空`)
    const defect = item?.defect
    if (!defect || typeof defect !== 'object') fail(`${where}: 缺少 defect`)
    else {
      if (typeof defect.type !== 'string' || defect.type.trim() === '') fail(`${where}: defect.type 不能为空`)
      if (typeof defect.description !== 'string' || defect.description.trim() === '') fail(`${where}: defect.description 不能为空`)
      const content = item?.files?.[defect.file]
      if (typeof content !== 'string') fail(`${where}: defect.file=${defect.file} 不在 files 中`)
      else {
        const lines = content.split('\n')
        if (!Number.isInteger(defect.line) || defect.line < 1 || defect.line > lines.length) {
          fail(`${where}: defect.line=${defect.line} 超出 ${defect.file} 的 ${lines.length} 行`)
        } else if (typeof defect.excerpt !== 'string' || !lines[defect.line - 1].includes(defect.excerpt)) {
          fail(`${where}: 第 ${defect.line} 行不包含 ${JSON.stringify(defect.excerpt)}`)
        }
      }
    }
    const variants = item?.variants
    for (const key of ['hint', 'direct']) {
      if (typeof variants?.[key] !== 'string' || variants[key].trim() === '') fail(`${where}: variants.${key} 不能为空`)
    }
    if (!Array.isArray(variants?.multiTurn) || variants.multiTurn.length < 2 || variants.multiTurn.length > 4) {
      fail(`${where}: variants.multiTurn 需要 2–4 轮`)
    } else if (variants.multiTurn.some(turn => typeof turn !== 'string' || turn.trim() === '')) {
      fail(`${where}: variants.multiTurn 存在空轮次`)
    }
  })
  return errors
}

export function loadCorpus(directory) {
  const files = readdirSync(directory).filter(name => name.endsWith('.json')).sort()
  const corpus = []
  const errors = []
  for (const name of files) {
    let data
    try {
      data = JSON.parse(readFileSync(join(directory, name), 'utf8'))
    } catch (error) {
      errors.push(`${name}: JSON 解析失败（${error.message}）`)
      continue
    }
    const fileErrors = validateFile(name, data)
    if (fileErrors.length) errors.push(...fileErrors)
    else corpus.push({ category: data.category, items: data.items })
  }
  return { corpus, errors, files }
}

export function summary(corpus) {
  const byCategory = Object.fromEntries(corpus.map(entry => [entry.category, entry.items.length]))
  const total = corpus.reduce((sum, entry) => sum + entry.items.length, 0)
  const variants = corpus.reduce((sum, entry) => sum + entry.items.reduce((inner, item) => inner + 2 + item.variants.multiTurn.length, 0), 0)
  return { byCategory, total, variants }
}

export function selfTest() {
  const failures = []
  const check = (name, run) => {
    try { run() } catch (error) { failures.push(`${name}: ${error.message}`) }
  }
  const base = {
    schemaVersion: 1, category: 'css',
    items: [{
      id: 'css-001', title: 't', prompt: 'p',
      files: { 'style.css': 'a\nb\nc' },
      defect: { type: 'x', file: 'style.css', line: 2, excerpt: 'b', description: 'd' },
      variants: { hint: 'h', direct: 'd', multiTurn: ['1', '2'] },
    }],
  }
  check('合法语料通过', () => {
    const errors = validateFile('css.json', base)
    if (errors.length) throw new Error(errors.join('; '))
  })
  check('行号越界被发现', () => {
    const data = structuredClone(base)
    data.items[0].defect.line = 9
    if (!validateFile('css.json', data).some(e => e.includes('超出'))) throw new Error('未发现越界')
  })
  check('金标准片段不匹配被发现', () => {
    const data = structuredClone(base)
    data.items[0].defect.excerpt = 'zzz'
    if (!validateFile('css.json', data).some(e => e.includes('不包含'))) throw new Error('未发现片段不匹配')
  })
  check('id 前缀与类别不一致被发现', () => {
    const data = structuredClone(base)
    data.items[0].id = 'html-001'
    if (!validateFile('css.json', data).some(e => e.includes('前缀'))) throw new Error('未发现前缀错误')
  })
  check('缺多轮问法被发现', () => {
    const data = structuredClone(base)
    data.items[0].variants.multiTurn = ['1']
    if (!validateFile('css.json', data).some(e => e.includes('multiTurn'))) throw new Error('未发现轮次不足')
  })
  check('类别不匹配被发现', () => {
    const data = structuredClone(base)
    if (!validateFile('html.json', data).some(e => e.includes('category'))) throw new Error('未发现类别不一致')
  })
  if (failures.length) {
    console.error(`SELFTEST FAIL (${failures.length})`)
    for (const failure of failures) console.error(`  - ${failure}`)
    return 1
  }
  console.log('SELFTEST PASS: 6 项（合法通过、行号越界、片段不符、id 前缀、轮次不足、类别不符）')
  return 0
}

const HELP = `实验语料校验（只读）

  node scripts/experiment-corpus.mjs [--dir <目录>]
  node scripts/experiment-corpus.mjs --self-test

默认目录：${DEFAULT_DIR}
`

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
  if (options.selfTest && selfTest() !== 0) return 1
  let result
  try {
    result = loadCorpus(resolve(options.dir))
  } catch (error) {
    console.error(`无法读取语料目录 ${options.dir}：${error.message}`)
    return 1
  }
  if (result.errors.length) {
    console.error(`语料校验失败（${result.errors.length} 条）：`)
    for (const error of result.errors) console.error(`  - ${error}`)
    return 1
  }
  const { byCategory, total, variants } = summary(result.corpus)
  console.log(`OK: ${result.files.length} 个文件、${total} 题、${variants} 个用例（每题 = 提示/直答/多轮各计）`)
  console.log('分类：' + Object.entries(byCategory).map(([key, value]) => `${key}=${value}`).join('  '))
  const missing = CATEGORIES.filter(category => !result.files.includes(`${category}.json`))
  if (missing.length) console.log(`提示：缺少文件 ${missing.join(', ')}`)
  if (total < 40) console.log(`提示：目标 40 题，当前 ${total} 题；补齐前不开始 E1 正式采集。`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
