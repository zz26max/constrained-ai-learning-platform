#!/usr/bin/env node
/**
 * E1 对照实验：实验班与两组中性作业的一次性准备（幂等）。
 *
 * 做什么：
 * 1. 教师建/复用教学班「E1 受限辅导实验班」，四个章节；
 * 2. 建/复用两份中性题面的作业（Web 与 SQL），发布；
 * 3. 给两份作业写启用状态的 AI 政策（E1 的 B 组需要）；
 * 4. 建邀请码并注册/复用一名学校模式学生，供 B 组发问；
 * 5. 把 offering / 作业 / 学生凭据写进 .cache/experiments/e1-import.json（Git 忽略）。
 *
 * 为什么是「两份中性作业」而不是四十份：E1 的题目代码由运行器逐例写进工作区，
 * 作业本身只提供题面与 AI 政策，题面固定为中性描述，避免把某道题的要求灌进别的题。
 *
 * 用法：
 *   node scripts/experiment-import.mjs --dry-run
 *   node scripts/experiment-import.mjs
 *   node scripts/experiment-import.mjs --rebuild   # 改过题面/初始文件后归档旧作业再建
 *
 * 口令：教师口令读 backend/.env 的 LOCAL_TEACHER_PASSWORD（或 DEMO_TEACHER_PASSWORD），
 * 学生口令由本脚本生成并只写进被 Git 忽略的 map 文件，不打印。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Session, ROOT, arg, has, loadLocalEnv } from './experiment-http.mjs'

const BASE = arg('base-url', process.env.EXPERIMENT_BASE_URL ?? 'http://127.0.0.1:8080')
const ORIGIN = arg('origin', process.env.EXPERIMENT_ORIGIN ?? 'http://127.0.0.1:4173')
const COURSE_ID = '00000000-0000-4000-8000-000000000110' // V16 Web 开发基础
const OFFERING_TITLE = arg('offering-title', 'E1 受限辅导实验班')
const OFFERING_GROUP = '工程实践 · 实验'
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

// 题面只说场景与方法，不写"不要给完整实现"一类的话：
// TutoringSafety 的输入意图正则含「完整.{0,8}(代码|答案|实现)」，题面自己撞上会让每次请求都
// 在进模型前被判 POLICY_REJECTED，整批数据变成全回退（2026-11-11 实测踩到）。
// 「不代答」的边界由平台自己的 boundary 文案负责，题面不重复。
const NEUTRAL_DESCRIPTION =
  '学生把自己的 HTML/CSS/JS（或 SQL）代码粘进工作区，并描述了一个现象，希望得到排查方向。'
  + '请围绕学生问到的这一处回应：先说明该看什么，再给一个能自己验证的下一步。'

const ASSIGNMENTS = [
  {
    key: 'web_lab',
    chapterIndex: 0,
    title: '[E1] Web 排查（中性题面）',
    type: 'web_lab',
    description: NEUTRAL_DESCRIPTION,
    requirements: ['只排查学生提到的这一处', '先描述现象，再给可验证的下一步'],
    initialFiles: [
      { path: 'index.html', content: '<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <title>示例</title>\n</head>\n<body>\n  <p>示例</p>\n</body>\n</html>\n' },
      { path: 'style.css', content: 'body { margin: 0; }\n' },
      { path: 'script.js', content: '// 示例脚本\n' },
    ],
  },
  {
    key: 'sql_text',
    chapterIndex: 3,
    title: '[E1] SQL 排查（中性题面）',
    type: 'sql_text',
    description: NEUTRAL_DESCRIPTION,
    requirements: ['只排查学生提到的这一处', '先描述现象，再给可验证的下一步'],
    initialFiles: [{ path: 'answer.sql', content: 'SELECT 1;\n' }],
  },
]

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
  if (existing) return { offering: existing, created: false }
  const created = (await teacher.request('POST', '/api/v1/teacher/offerings', {
    courseId: COURSE_ID, title: OFFERING_TITLE, groupName: OFFERING_GROUP,
    termId, progressUnit: 'chapter',
  })).data
  return { offering: created, created: true }
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
      console.log(`  + 章节 ${def.title}`)
    }
    if (chapter.publicationState !== 'published') {
      chapter = (await teacher.request('POST', `/api/v1/teacher/chapters/${chapter.id}/publish`, {})).data
      console.log(`  ↑ 发布章节 ${def.title}`)
    }
    ids.push(chapter.id)
  }
  return ids
}

async function ensureAssignment(teacher, offeringId, chapterIds, def, rebuild) {
  const list = async () => (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/assignments?page=1&pageSize=100`)).data.items
  // 教师端 DTO 用 publicationState（contract: TeacherAssignmentDTO），不是 status。
  const live = item => item.publicationState !== 'archived'
  let items = await list()
  if (rebuild) {
    for (const stale of items.filter(item => item.title === def.title && live(item))) {
      await teacher.request('POST', `/api/v1/teacher/assignments/${stale.id}/archive`, {})
      console.log(`  - 归档旧作业 ${def.title}`)
    }
    items = await list()
  }
  let assignment = items.find(item => item.title === def.title && live(item))
  if (!assignment) {
    const created = (await teacher.request('POST', `/api/v1/teacher/offerings/${offeringId}/assignments`, {
      chapterId: chapterIds[def.chapterIndex],
      title: def.title,
      type: def.type,
      isRequired: false,
      description: def.description,
      requirements: def.requirements,
      estimatedMinutes: 20,
      knowledgePointIds: [],
      dueAt: iso(90 * 24 * 3600 * 1000),
      lateUntil: null,
      allowResubmit: true,
      maxAttempts: 10,
      maxScore: 100,
      rubric: [{ criterionId: 'e1', title: '排查过程', description: '实验用，不参与评分。', maxScore: 100 }],
      initialFiles: def.initialFiles,
      aiPolicyVersion: null,
    })).data
    assignment = (await teacher.request('POST', `/api/v1/teacher/assignments/${created.id}/publish`, {})).data
    console.log(`  + 作业 ${def.title}（已发布）`)
  } else {
    console.log(`  = 复用作业 ${def.title}`)
  }
  return assignment
}

async function ensureAiPolicy(teacher, assignmentId, label) {
  const current = (await teacher.request('GET', `/api/v1/teacher/assignments/${assignmentId}/ai-policy`)).data
  const baseVersion = current?.version ?? 0
  if (current?.enabled === true && (current.maxHintLevel ?? 0) >= 3) {
    console.log(`  = AI 政策已启用（${label}，v${baseVersion}）`)
    return current
  }
  const saved = (await teacher.request('PUT', `/api/v1/teacher/assignments/${assignmentId}/ai-policy`, {
    baseVersion, ...AI_POLICY,
  })).data
  console.log(`  + AI 政策已写入（${label}，v${saved.version}）`)
  return saved
}

async function ensureStudent(inviteCode, map) {
  const username = map?.student?.username ?? `e1.runner.${shortId()}`
  const password = map?.student?.password ?? `E1!${Math.random().toString(36).slice(2, 12)}Aa`
  const session = new Session({ baseUrl: BASE, origin: ORIGIN, label: username })
  const registered = await session.register({
    username, password, displayName: 'E1 运行账号', mode: 'school', role: 'student', inviteCode,
  })
  if (registered.existing) {
    await session.login(username, password)
    console.log(`  = 复用实验学生 ${username}`)
  } else {
    console.log(`  + 注册实验学生 ${username}`)
  }
  const courses = (await session.request('GET', '/api/v1/me/courses')).data.items
  return { username, password, session, courseCount: courses.length }
}

async function main() {
  loadLocalEnv()
  const teacherPassword = process.env.DEMO_TEACHER_PASSWORD ?? process.env.LOCAL_TEACHER_PASSWORD
  if (!teacherPassword) throw new Error('缺少教师口令：backend/.env 需有 LOCAL_TEACHER_PASSWORD。')

  console.log(`E1 准备：${BASE}（${DRY ? 'dry-run，不写任何数据' : '真实写入'}）`)
  if (DRY) {
    console.log(JSON.stringify({
      offering: OFFERING_TITLE, chapters: CHAPTERS.map(c => c.title),
      assignments: ASSIGNMENTS.map(a => ({ title: a.title, type: a.type, files: a.initialFiles.map(f => f.path) })),
      aiPolicy: AI_POLICY,
    }, null, 2))
    return
  }

  const map = readMap()
  const teacher = new Session({ baseUrl: BASE, origin: ORIGIN, label: 'teacher' })
  const teacherUser = await teacher.login(process.env.DEMO_TEACHER ?? 'teacher.demo', teacherPassword)
  console.log(`✓ 教师登录：${teacherUser.username}`)

  const config = (await teacher.request('GET', '/api/v1/me/config')).data
  if (!config.currentTermId) throw new Error('当前没有学期，无法建班。')
  console.log(`✓ 当前学期：${config.currentTermId}`)

  if (map?.offeringId) {
    const list = (await teacher.request('GET', `/api/v1/teacher/offerings?page=1&pageSize=100&termId=${config.currentTermId}`)).data
    if (!list.items.some(item => item.id === map.offeringId)) {
      console.log('! map 里的教学班已不存在，按标题重新建')
      map.offeringId = null
    }
  }

  const { offering } = map?.offeringId
    ? { offering: { id: map.offeringId } }
    : await ensureOffering(teacher, config.currentTermId)
  console.log(`✓ 教学班：${offering.id}`)

  const chapterIds = await ensureChapters(teacher, offering.id)
  const assignments = {}
  for (const def of ASSIGNMENTS) {
    const assignment = await ensureAssignment(teacher, offering.id, chapterIds, def, REBUILD)
    await ensureAiPolicy(teacher, assignment.id, def.key)
    assignments[def.key] = assignment.id
  }

  const invite = (await teacher.request('POST', `/api/v1/teacher/offerings/${offering.id}/invites`, {
    expiresAt: iso(365 * 24 * 3600 * 1000), maxUses: null,
  })).data
  const student = await ensureStudent(invite.inviteCode, map)

  const next = {
    baseUrl: BASE,
    origin: ORIGIN,
    termId: config.currentTermId,
    offeringId: offering.id,
    assignments,
    student: { username: student.username, password: student.password },
    updatedAt: new Date().toISOString(),
  }
  writeMap(next)
  console.log(`✓ 已写入 ${MAP_PATH.replace(ROOT + '/', '')}`)
  console.log(`  作业：web_lab=${assignments.web_lab} sql_text=${assignments.sql_text}`)
  console.log(`  学生：${student.username}（口令在 map 文件里，不打印）`)
}

main().catch(error => {
  console.error('FAIL:', error.message)
  process.exitCode = 1
})
