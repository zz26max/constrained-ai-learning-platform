#!/usr/bin/env node
/**
 * E1 对照实验：按语料逐题建「一题一作业」的实验班（幂等）。
 *
 * 为什么一题一作业（2026-11-11 实测后的结论）：
 * 1. 辅导额度按「同学生同作业每天 12 次」封顶（AI 政策 dailyAssignmentLimit 上限 12），
 *    40 题共 200 次请求压在少数作业上必然被 429 挡住；
 * 2. 判题/工作区按「作业」区分，一题一作业才能让每道题的初始代码与缺陷各自成立。
 *
 * 归一化：语料里有 7 题的脚本叫 app.js，而 web 作业只允许 index.html/style.css/script.js。
 * 导入时把 app.js 改名为 script.js，并把 index.html 里 <script src="app.js"> 同步改掉；
 * 这处改动会写进实验记录——它改的是文件名，不改缺陷本身。
 *
 * 用法：
 *   node scripts/experiment-import.mjs --dry-run
 *   node scripts/experiment-import.mjs
 *   node scripts/experiment-import.mjs --rebuild   # 归档同名旧作业后重建
 *
 * 口令：教师口令读 backend/.env 的 LOCAL_TEACHER_PASSWORD（或 DEMO_TEACHER_PASSWORD），
 * 学生口令由本脚本生成并只写进被 Git 忽略的 map 文件，不打印。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Session, ROOT, arg, has, loadLocalEnv } from './experiment-http.mjs'

const BASE = arg('base-url', process.env.EXPERIMENT_BASE_URL ?? 'http://127.0.0.1:8080')
const ORIGIN = arg('origin', process.env.EXPERIMENT_ORIGIN ?? 'http://127.0.0.1:4173')
const COURSE_ID = '00000000-0000-4000-8000-000000000110' // V16 Web 开发基础
const OFFERING_TITLE = arg('offering-title', 'E1 受限辅导实验班')
const OFFERING_GROUP = '工程实践 · 实验'
const CORPUS_DIR = join(ROOT, 'docs/features/experiment-corpus')
const CATEGORY_FILE = { 'html.json': 'html', 'css.json': 'css', 'event.json': 'event', 'sql.json': 'sql' }
const CHAPTER_INDEX = { html: 0, css: 1, event: 2, sql: 3 }
const DRY = has('dry-run')
/** 重建：归档同名旧作业后新建，用来改题面/初始文件后重新取到干净的作业。 */
const REBUILD = has('rebuild')
const MAP_PATH = join(ROOT, '.cache/experiments/e1-import.json')

const CHAPTERS = [
  { number: 1, title: 'HTML 结构', summary: '文档结构、语义标签与常见嵌套问题。' },
  { number: 2, title: 'CSS 布局', summary: '选择器、盒模型、Flex 与响应式。' },
  { number: 3, title: 'DOM 事件', summary: '事件绑定、冒泡、执行时机与闭包。' },
  { number: 4, title: 'SQL 查询', summary: '查询、聚合、NULL 与排序。' },
]

// 题面只说场景与方法：TutoringSafety 的输入意图正则含「完整.{0,8}(代码|答案|实现)」，
// 题面自己撞上会让每次请求都在进模型前被判 POLICY_REJECTED（2026-11-11 实测踩到）。
const NEUTRAL_DESCRIPTION =
  '学生把自己的 HTML/CSS/JS（或 SQL）代码粘进工作区，并描述了一个现象，希望得到排查方向。'
  + '请围绕学生问到的这一处回应：先说明该看什么，再给一个能自己验证的下一步。'
const NEUTRAL_REQUIREMENTS = ['只排查学生提到的这一处', '先描述现象，再给可验证的下一步']

const AI_POLICY = {
  enabled: true,
  allowedActions: ['ask', 'concept', 'next_hint'],
  allowedModes: ['concept', 'debug_hint', 'guided_question'],
  restrictCompleteSolution: true,
  allowCodeBlocks: false,
  maxHintLevel: 3,
  requireAttemptFromLevel: 2,
  dailyUserLimit: 30,
  dailyAssignmentLimit: 12,
  perMinuteLimit: 3,
  maxOutputTokens: 800,
}

const iso = ms => new Date(Date.now() + ms).toISOString()
const shortId = () => Math.random().toString(36).slice(2, 10)

function loadCorpusItems() {
  const items = []
  for (const file of readdirSync(CORPUS_DIR)) {
    const category = CATEGORY_FILE[file]
    if (!category) continue
    const data = JSON.parse(readFileSync(join(CORPUS_DIR, file), 'utf8'))
    for (const item of data.items) items.push({ ...item, category })
  }
  return items.sort((left, right) => left.id.localeCompare(right.id))
}

/** app.js → script.js，并同步改 index.html 里的引用；其余原样。 */
export function normalizeCorpusFiles(files) {
  const out = {}
  for (const [path, content] of Object.entries(files)) {
    if (path === 'app.js') { out['script.js'] = content; continue }
    out[path] = /<script[^>]+src=["']app\.js["']/i.test(content)
      ? content.replace(/(<script[^>]+src=["'])app\.js(["'])/gi, '$1script.js$2')
      : content
  }
  return out
}

function readMap() {
  try { return JSON.parse(readFileSync(MAP_PATH, 'utf8')) } catch { return null }
}

function writeMap(map) {
  mkdirSync(join(ROOT, '.cache/experiments'), { recursive: true })
  writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
}

async function ensureOffering(teacher, termId) {
  const list = (await teacher.request('GET', `/api/v1/teacher/offerings?page=1&pageSize=100&termId=${termId}`)).data
  const existing = list.items.find(item => item.title === OFFERING_TITLE)
  if (existing) return existing
  return (await teacher.request('POST', '/api/v1/teacher/offerings', {
    courseId: COURSE_ID, title: OFFERING_TITLE, groupName: OFFERING_GROUP,
    termId, progressUnit: 'chapter',
  })).data
}

async function ensureChapters(teacher, offeringId) {
  const items = (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/chapters`)).data.items
  const ids = []
  for (const def of CHAPTERS) {
    let chapter = items.find(item => item.title === def.title)
    if (!chapter) {
      chapter = (await teacher.request('POST', `/api/v1/teacher/offerings/${offeringId}/chapters`, {
        number: def.number, title: def.title, summary: def.summary, isRequired: true,
      })).data
    }
    if (chapter.publicationState !== 'published') {
      chapter = (await teacher.request('POST', `/api/v1/teacher/chapters/${chapter.id}/publish`, {})).data
    }
    ids.push(chapter.id)
  }
  return ids
}

async function ensureAssignment(teacher, offeringId, chapterIds, item, rebuild) {
  const title = `[E1] ${item.id} ${item.title}`.slice(0, 200)
  const list = async () => (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/assignments?page=1&pageSize=100`)).data.items
  // 教师端 DTO 用 publicationState（contract: TeacherAssignmentDTO），不是 status。
  const live = entry => entry.publicationState !== 'archived'
  let items = await list()
  if (rebuild) {
    for (const stale of items.filter(entry => entry.title === title && live(entry))) {
      await teacher.request('POST', `/api/v1/teacher/assignments/${stale.id}/archive`, {})
    }
    items = await list()
  }
  const existing = items.find(entry => entry.title === title && live(entry))
  if (existing) return { id: existing.id, created: false }

  const files = normalizeCorpusFiles(item.files)
  const ordered = Object.entries(files).sort(([left], [right]) => left.localeCompare(right))
  const created = (await teacher.request('POST', `/api/v1/teacher/offerings/${offeringId}/assignments`, {
    chapterId: chapterIds[CHAPTER_INDEX[item.category]],
    title,
    type: item.category === 'sql' ? 'sql_text' : 'web_lab',
    isRequired: false,
    description: NEUTRAL_DESCRIPTION,
    requirements: NEUTRAL_REQUIREMENTS,
    estimatedMinutes: 20,
    knowledgePointIds: [],
    dueAt: iso(180 * 24 * 3600 * 1000),
    lateUntil: null,
    allowResubmit: true,
    maxAttempts: 20,
    maxScore: 100,
    rubric: [{ criterionId: 'e1', title: '排查过程', description: '实验用，不参与评分。', maxScore: 100 }],
    initialFiles: ordered.map(([path, content]) => ({ path, content })),
    aiPolicyVersion: null,
  })).data
  const published = (await teacher.request('POST', `/api/v1/teacher/assignments/${created.id}/publish`, {})).data
  return { id: published.id, created: true }
}

async function ensureAiPolicy(teacher, assignmentId) {
  const current = (await teacher.request('GET', `/api/v1/teacher/assignments/${assignmentId}/ai-policy`)).data
  if (current?.enabled === true && (current.maxHintLevel ?? 0) >= 3) return current
  return (await teacher.request('PUT', `/api/v1/teacher/assignments/${assignmentId}/ai-policy`, {
    baseVersion: current?.version ?? 0, ...AI_POLICY,
  })).data
}

async function ensureStudent(inviteCode, map) {
  const username = map?.student?.username ?? `e1.runner.${shortId()}`
  const password = map?.student?.password ?? `E1!${Math.random().toString(36).slice(2, 12)}Aa`
  const session = new Session({ baseUrl: BASE, origin: ORIGIN, label: username })
  const registered = await session.register({
    username, password, displayName: 'E1 运行账号', mode: 'school', role: 'student', inviteCode,
  })
  if (registered.existing) await session.login(username, password)
  return { username, password, registered: !registered.existing }
}

async function main() {
  loadLocalEnv()
  const teacherPassword = process.env.DEMO_TEACHER_PASSWORD ?? process.env.LOCAL_TEACHER_PASSWORD
  if (!teacherPassword) throw new Error('缺少教师口令：backend/.env 需有 LOCAL_TEACHER_PASSWORD。')

  const items = loadCorpusItems()
  const normalized = items.filter(item => item.files['app.js']).length
  console.log(`E1 准备：${items.length} 题（其中 ${normalized} 题的 app.js 归一化为 script.js）`)
  if (DRY) {
    console.log(JSON.stringify(items.slice(0, 3).map(item => ({
      id: item.id, category: item.category,
      title: `[E1] ${item.id} ${item.title}`.slice(0, 80),
      files: Object.keys(normalizeCorpusFiles(item.files)),
    })), null, 2))
    console.log(`…共 ${items.length} 份作业；${DRY ? 'dry-run 不写数据' : ''}`)
    return
  }

  const map = readMap()
  const teacher = new Session({ baseUrl: BASE, origin: ORIGIN, label: 'teacher' })
  const teacherUser = await teacher.login(process.env.DEMO_TEACHER ?? 'teacher.demo', teacherPassword)
  console.log(`✓ 教师登录：${teacherUser.username}`)

  const config = (await teacher.request('GET', '/api/v1/me/config')).data
  if (!config.currentTermId) throw new Error('当前没有学期，无法建班。')

  const offering = await ensureOffering(teacher, config.currentTermId)
  console.log(`✓ 教学班：${offering.id}`)
  const chapterIds = await ensureChapters(teacher, offering.id)

  const mapping = {}
  let created = 0
  let reused = 0
  let policies = 0
  for (const [index, item] of items.entries()) {
    const { id, created: isNew } = await ensureAssignment(teacher, offering.id, chapterIds, item, REBUILD)
    if (isNew) created += 1; else reused += 1
    const policy = await ensureAiPolicy(teacher, id)
    if (policy?.enabled) policies += 1
    mapping[item.id] = id
    if ((index + 1) % 10 === 0) console.log(`  …${index + 1}/${items.length}（新建 ${created}，复用 ${reused}）`)
  }

  const invite = (await teacher.request('POST', `/api/v1/teacher/offerings/${offering.id}/invites`, {
    expiresAt: iso(365 * 24 * 3600 * 1000), maxUses: null,
  })).data
  const student = await ensureStudent(invite.inviteCode, map)

  writeMap({
    baseUrl: BASE, origin: ORIGIN, termId: config.currentTermId, offeringId: offering.id,
    items: mapping,
    student: { username: student.username, password: student.password },
    normalized: { appJsRenamed: normalized },
    updatedAt: new Date().toISOString(),
  })
  console.log(`✓ 作业 ${items.length} 份（新建 ${created}，复用 ${reused}），AI 政策启用 ${policies} 份`)
  console.log(`✓ 学生 ${student.username}${student.registered ? '（新注册）' : '（复用）'}，凭据写入 map 文件`)
  console.log(`✓ 已写入 ${MAP_PATH.replace(ROOT + '/', '')}`)
}

main().catch(error => {
  console.error('FAIL:', error.message)
  process.exitCode = 1
})
