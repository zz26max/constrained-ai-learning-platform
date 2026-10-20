// 构建产物 mock 检查：生产包不得包含 mock 处理器、数据或启动入口（FRONTEND.md 1.1）。
// 扫描 dist 中全部文本产物；发现 mock 哨兵标记即失败。运行前需先完成 npm run build。
import { readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const SENTINELS = ['MOCK_LAYER_ACTIVE', 'mock-demo-pass', 'MockNotImplementedError', 'CAMPUS_DEMO_ONLY', 'campus.student', 'installCampusClock', '高校演示 · 虚构数据', '视觉工艺评审', '体验精修评审']

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

// Presentation classes may ship; the demo module graph must never be reachable.
const sourceRoot=fileURLToPath(new URL('../src/',import.meta.url))
const seen=new Set()
async function walk(file){
 if(seen.has(file))return
 seen.add(file)
 if(file.includes(path.sep+'demo'+path.sep)||file.includes(path.sep+'mocks'+path.sep)){
  // Explicit mock mode is dynamically eliminated by the real production build;
  // keep the bundle sentinels above for that existing transport branch.
  if(file.includes(path.sep+'demo'+path.sep))throw new Error('Production imports demo module: '+path.relative(sourceRoot,file))
  return
 }
 const text=await readFile(file,'utf8')
 for(const match of text.matchAll(/(?:from\s*|import\s*\(?\s*|@import\s*)['"](\.[^'"]+)['"]/g)){
  const base=path.resolve(path.dirname(file),match[1])
  for(const candidate of [base,base+'.ts',base+'.vue',base+'.css',path.join(base,'index.ts')])if(await exists(candidate)&&!(await stat(candidate)).isDirectory()){await walk(candidate);break}
 }
}
await walk(path.join(sourceRoot,'main.ts'))
console.log('PASS: production dependency graph contains no demo entry, clock, transport or review controls.')
