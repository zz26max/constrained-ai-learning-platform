// 构建产物 mock 检查：生产包不得包含 mock 处理器、数据或启动入口（FRONTEND.md 1.1）。
// 扫描 dist 中全部文本产物；发现 mock 哨兵标记即失败。运行前需先完成 npm run build。
import { readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const SENTINELS = ['MOCK_LAYER_ACTIVE', 'mock-demo-pass', 'MockNotImplementedError', 'CAMPUS_DEMO_ONLY', 'campus.student', 'vx-course-masthead']

async function exists(candidate) {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)))
    } else if (/\.(js|mjs|css|html|svg|json)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

if (!(await exists(distDir))) {
  console.error('FAIL: dist/ 不存在，请先运行 npm run build。')
  process.exit(1)
}

const files = await collectFiles(distDir)
if (files.length === 0) {
  console.error('FAIL: dist/ 为空，构建产物缺失。')
  process.exit(1)
}

const violations = []
if(await exists(path.join(distDir,'campus.html')))violations.push('campus.html 不得进入生产构建')
for (const file of files) {
  const text = await readFile(file, 'utf8')
  for (const sentinel of SENTINELS) {
    if (text.includes(sentinel)) {
      violations.push(`${path.relative(distDir, file)} 包含 mock 标记 "${sentinel}"`)
    }
  }
}

if (violations.length > 0) {
  console.error('FAIL: 生产构建产物包含 mock 内容：')
  for (const violation of violations) {
    console.error(`  - ${violation}`)
  }
  process.exit(1)
}

console.log(`PASS: ${files.length} 个构建产物文件，未发现 mock 层内容（${SENTINELS.join(' / ')}）。`)
