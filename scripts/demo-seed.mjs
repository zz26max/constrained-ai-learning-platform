#!/usr/bin/env node
/**
 * 演示数据准备（真实数据，全部走产品 HTTP 接口）。
 *
 * 做四件事：
 * 1. 教师建教学班、3 个章节、4 个知识点、1 份已发布作业、1 个邀请码；
 * 2. 用邀请码注册两名学校模式学生 demo.s1 / demo.s2；
 * 3. demo.s1 保存工作区并提交一次作业，demo.s2 产生章节学习事件；
 * 4. 教师对提交打分并发布评价（含知识点评价）。
 *
 * 可重复执行：按标题/用户名复用已有对象，不会重复建班或重复提交。
 * 口令只从环境变量或 backend/.env 读取，不打印；学生在输出里给出固定演示口令。
 *
 * 用法：
 *   node scripts/demo-seed.mjs
 *   node scripts/demo-seed.mjs --base-url http://127.0.0.1:8080 --origin http://127.0.0.1:4173
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const BASE = arg('base-url', process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:8080')
const ORIGIN = arg('origin', process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:4173')
const TEACHER = arg('teacher', 'teacher.demo')
const DEMO_STUDENT_PASSWORD = 'Demo.Student.2026'
const COURSE_ID = '00000000-0000-4000-8000-000000000110' // V16 Web 开发基础
const OFFERING_TITLE = '工程实践 · Web 开发演示班'
const OFFERING_GROUP = '2026 秋季 · 演示班'
const ASSIGNMENT_TITLE = '个人主页：结构、样式与交互'

function loadLocalEnv() {
  const path = join(ROOT, 'backend/.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line)
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
  }
}

class ApiError extends Error {
  constructor(method, path, status, payload) {
    const code = payload?.error?.code ?? ''
    const message = payload?.error?.message ?? ''
    const details = payload?.error?.details ? ' ' + JSON.stringify(payload.error.details) : ''
    super(`${method} ${path} -> ${status} ${code} ${message}${details}`.trim())
    this.status = status
    this.code = code
  }
}

/** 带 cookie 与 CSRF 的最小会话客户端；只依赖 fetch，不引第三方库。 */
class Session {
  constructor() {
    this.cookies = new Map()
    this.token = null
  }

  cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  absorb(response) {
    const list = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : [])
    for (const raw of list) {
      const pair = raw.split(';')[0]
      const index = pair.indexOf('=')
      if (index <= 0) continue
      const name = pair.slice(0, index)
      const value = pair.slice(index + 1)
      const expired = /max-age=0/i.test(raw)
      if (expired || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  async request(method, path, body, { csrf = true, allowStatus = [] } = {}) {
    const headers = { Origin: ORIGIN }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (csrf) {
      if (this.token === null) await this.refreshCsrf()
      headers['X-CSRF-Token'] = this.token
    }
    const cookie = this.cookieHeader()
    if (cookie) headers.Cookie = cookie
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    this.absorb(response)
    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }
    if (!response.ok && !allowStatus.includes(response.status)) {
      throw new ApiError(method, path, response.status, payload)
    }
    return { status: response.status, data: payload?.data ?? null, error: payload?.error ?? null }
  }

  async refreshCsrf() {
    this.token = null
    const { data } = await this.request('GET', '/api/v1/auth/csrf-token', undefined, { csrf: false })
    this.token = data.csrfToken
    return this.token
  }

  async login(username, password) {
    await this.refreshCsrf()
    const { data } = await this.request('POST', '/api/v1/auth/login', { username, password })
    this.token = data.csrfToken
    return data.user
  }

  async register(payload) {
    await this.refreshCsrf()
    const { data, status } = await this.request('POST', '/api/v1/auth/register', payload, { allowStatus: [400] })
    if (status === 400) return { existing: true, data: null }
    this.token = data.csrfToken
    return { existing: false, data: data.user }
  }
}

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString()

async function main() {
  loadLocalEnv()
  const teacherPassword = process.env.DEMO_TEACHER_PASSWORD ?? process.env.LOCAL_TEACHER_PASSWORD
  if (!teacherPassword) {
    throw new Error('缺少教师口令：设置 DEMO_TEACHER_PASSWORD 或 backend/.env 的 LOCAL_TEACHER_PASSWORD。')
  }

  const teacher = new Session()
  const teacherUser = await teacher.login(TEACHER, teacherPassword)
  console.log(`✓ 教师登录：${teacherUser.username}`)

  const config = (await teacher.request('GET', '/api/v1/me/config')).data
  if (!config.currentTermId) throw new Error('当前没有学期，无法建班。先确认 V16 迁移或配置学期。')
  console.log(`✓ 当前学期：${config.currentTermId}`)

  // 1. 教学班（按标题复用）
  const offerings = (await teacher.request('GET', `/api/v1/teacher/offerings?page=1&pageSize=100&termId=${config.currentTermId}`)).data
  let offering = offerings.items.find((item) => item.title === OFFERING_TITLE)
  if (!offering) {
    offering = (await teacher.request('POST', '/api/v1/teacher/offerings', {
      courseId: COURSE_ID, title: OFFERING_TITLE, groupName: OFFERING_GROUP,
      termId: config.currentTermId, progressUnit: 'chapter',
    })).data
    console.log(`✓ 已建教学班：${offering.id}`)
  } else {
    console.log(`= 复用教学班：${offering.id}`)
  }
  const offeringId = offering.id

  // 2. 章节（按标题复用，草稿则发布）
  const chapterDefs = [
    { number: 1, title: 'HTML 结构与语义化', summary: 'DOCTYPE、html/head/body、标题与段落、列表、链接与图片、语义化标签。' },
    { number: 2, title: 'CSS 盒模型与布局', summary: '选择器优先级、盒模型、Flexbox 一维布局、媒体查询与响应式。' },
    { number: 3, title: 'JavaScript 与 DOM 交互', summary: '变量与函数、DOM 查询与事件绑定、表单校验。' },
  ]
  const chapters = (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/chapters`)).data.items
  const chapterIds = []
  for (const def of chapterDefs) {
    let chapter = chapters.find((item) => item.title === def.title)
    if (!chapter) {
      chapter = (await teacher.request('POST', `/api/v1/teacher/offerings/${offeringId}/chapters`, {
        number: def.number, title: def.title, summary: def.summary, isRequired: true,
      })).data
      console.log(`✓ 已建章节：${def.title}`)
    }
    if (chapter.publicationState !== 'published') {
      chapter = (await teacher.request('POST', `/api/v1/teacher/chapters/${chapter.id}/publish`, {})).data
      console.log(`✓ 已发布章节：${def.title}`)
    }
    chapterIds.push(chapter.id)
  }

  // 3. 知识点（按标题复用）
  const pointDefs = [
    { chapterIndex: 0, title: 'HTML 文档结构', description: 'DOCTYPE、html/head/body 与 meta、title 的作用。', order: 1 },
    { chapterIndex: 0, title: '语义化标签', description: 'h1-h6、p、ul/ol、a、img 的正确嵌套与语义。', order: 2 },
    { chapterIndex: 1, title: '盒模型与间距', description: 'content/padding/border/margin 与 box-sizing。', order: 3 },
    { chapterIndex: 2, title: 'DOM 事件绑定', description: 'querySelector、addEventListener 与表单校验。', order: 4 },
  ]
  const pointItems = (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/knowledge-points`)).data.items
  const pointIds = []
  for (const def of pointDefs) {
    let point = pointItems.find((item) => item.title === def.title)
    if (!point) {
      point = (await teacher.request('POST', `/api/v1/teacher/offerings/${offeringId}/knowledge-points`, {
        chapterId: chapterIds[def.chapterIndex], title: def.title, description: def.description, order: def.order,
      })).data
      console.log(`✓ 已建知识点：${def.title}`)
    }
    pointIds.push(point.id)
  }

  // 4. 作业（按标题复用，草稿则发布）
  const rubric = [
    { criterionId: 'structure', title: '结构与语义', description: 'DOCTYPE、head/body、标题层级、列表与链接使用正确。', maxScore: 40 },
    { criterionId: 'style', title: '样式与布局', description: '盒模型与 Flex 布局合理，窄屏可用。', maxScore: 30 },
    { criterionId: 'interaction', title: '交互与脚本', description: '至少一处 DOM 事件与表单校验。', maxScore: 30 },
  ]
  const assignments = (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/assignments?page=1&pageSize=100`)).data.items
  let assignment = assignments.find((item) => item.title === ASSIGNMENT_TITLE)
  if (!assignment) {
    const created = (await teacher.request('POST', `/api/v1/teacher/offerings/${offeringId}/assignments`, {
      chapterId: chapterIds[0],
      title: ASSIGNMENT_TITLE,
      type: 'web_lab',
      isRequired: true,
      description: '用 HTML、CSS 和少量 JavaScript 做一个个人主页：结构清晰、语义正确、窄屏可用，并至少有一处交互。',
      requirements: [
        '使用完整的 HTML 文档结构，head 中包含 charset、viewport 与 title',
        '至少包含一个 h1、两段说明文字、一个无序列表和一个链接',
        '用 CSS 完成基础排版与布局，窗口收窄到 480px 时不横向溢出',
        '给一个按钮绑定点击或表单提交事件，并做基础校验',
      ],
      estimatedMinutes: 60,
      knowledgePointIds: [pointIds[0], pointIds[1]],
      dueAt: iso(14 * 24 * 3600 * 1000),
      lateUntil: null,
      allowResubmit: true,
      maxAttempts: 3,
      maxScore: 100,
      rubric,
      initialFiles: [
        { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>我的个人主页</title>\n</head>\n<body>\n  <!-- 在这里写你的主页 -->\n</body>\n</html>\n' },
        { path: 'style.css', content: '/* 基础样式 */\nbody { margin: 0; font-family: system-ui, sans-serif; }\n' },
        { path: 'script.js', content: '// 交互脚本\n' },
      ],
      aiPolicyVersion: null,
    })).data
    assignment = (await teacher.request('POST', `/api/v1/teacher/assignments/${created.id}/publish`, {})).data
    console.log(`✓ 已建并发布作业：${assignment.id}`)
  } else {
    console.log(`= 复用作业：${assignment.id}`)
  }
  const assignmentId = assignment.id

  // 5. 邀请码（每次新建，便于现场使用）
  const invite = (await teacher.request('POST', `/api/v1/teacher/offerings/${offeringId}/invites`, {
    expiresAt: iso(7 * 24 * 3600 * 1000), maxUses: null,
  })).data
  console.log('✓ 已创建邀请码（7 天有效，明文只在本次输出出现）')

  // 6. 两名学校模式学生
  const students = []
  for (const [username, displayName] of [['demo.s1', '演示学生甲'], ['demo.s2', '演示学生乙']]) {
    const session = new Session()
    const result = await session.register({ username, password: DEMO_STUDENT_PASSWORD, displayName, mode: 'school', role: 'student', inviteCode: invite.inviteCode })
    if (result.existing) {
      await session.login(username, DEMO_STUDENT_PASSWORD)
      console.log(`= 学生已存在：${username}`)
    } else {
      console.log(`✓ 已注册学生：${username}`)
    }
    students.push({ username, session })
  }

  // 7. demo.s1 保存工作区并提交
  const s1 = students[0].session
  const s1Courses = (await s1.request('GET', '/api/v1/me/courses')).data.items
  const s1Enrolled = s1Courses.some((item) => item.offeringId === offeringId)
  if (!s1Enrolled) throw new Error('demo.s1 未加入演示班，邀请码可能已失效；请重跑脚本。')
  const workspace = (await s1.request('GET', `/api/v1/assignments/${assignmentId}/workspace`)).data
  const saved = (await s1.request('PUT', `/api/v1/assignments/${assignmentId}/workspace`, {
    baseRevision: workspace.revision,
    files: [
      { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>周舟 · 个人主页</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <header class="hero">\n    <h1>周舟</h1>\n    <p>软件工程专业大三学生，正在学习 Web 前端开发。</p>\n  </header>\n  <main>\n    <section>\n      <h2>我在学什么</h2>\n      <ul>\n        <li>HTML 语义化结构与表单</li>\n        <li>CSS 盒模型与 Flexbox 布局</li>\n        <li>JavaScript DOM 事件与表单校验</li>\n      </ul>\n      <p><a href="https://developer.mozilla.org/zh-CN/">MDN Web 文档</a> 是我最常用的参考资料。</p>\n    </section>\n    <section>\n      <h2>留言</h2>\n      <form id="contact-form">\n        <label for="email">邮箱</label>\n        <input id="email" name="email" type="email" required>\n        <button type="submit">提交</button>\n      </form>\n      <p id="form-status" role="status"></p>\n    </section>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n' },
      { path: 'style.css', content: ':root { --brand: #2563eb; }\n* { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; line-height: 1.7; color: #1f2937; }\n.hero { padding: 48px 24px; background: linear-gradient(135deg, #dbeafe, #eff6ff); }\n.hero h1 { margin: 0 0 8px; font-size: 32px; }\nmain { max-width: 720px; margin: 0 auto; padding: 24px; }\nsection { margin-bottom: 32px; }\nh2 { font-size: 20px; }\nul { padding-left: 20px; }\nform { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }\ninput { padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; }\nbutton { padding: 8px 16px; border: 0; border-radius: 6px; background: var(--brand); color: #fff; cursor: pointer; }\n@media (max-width: 480px) { .hero { padding: 32px 16px; } main { padding: 16px; } }\n' },
      { path: 'script.js', content: "const form = document.getElementById('contact-form');\nconst status = document.getElementById('form-status');\nform.addEventListener('submit', (event) => {\n  event.preventDefault();\n  const email = form.email.value.trim();\n  status.textContent = email.includes('@') ? '已记录：' + email : '请填写有效的邮箱地址';\n});\n" },
    ],
    activeFile: 'index.html',
  })).data

  let submissionId = null
  const submissions = (await s1.request('GET', `/api/v1/assignments/${assignmentId}/submissions?page=1&pageSize=10`)).data
  if (submissions?.items?.length) {
    submissionId = submissions.items[0].id
    console.log(`= 已有提交：${submissionId}`)
  } else {
    const submission = (await s1.request('POST', `/api/v1/assignments/${assignmentId}/submissions`, {
      workspaceRevision: saved.revision,
      reflection: '第一次用语义化标签组织页面，Flex 布局在窄屏下还需要再调。',
    })).data
    submissionId = submission.id
    console.log(`✓ 已提交作业：${submissionId}`)
  }

  // 8. demo.s2 产生章节学习事件（分析页数据）
  const s2 = students[1].session
  const sessionId = randomUUID()
  const events = chapterIds.map((chapterId) => ({
    eventId: randomUUID(), sessionId, occurredAt: new Date().toISOString(),
    offeringId, chapterId, type: 'chapter_opened', payload: {},
  }))
  await s2.request('POST', '/api/v1/me/learning-events', { events })
  console.log('✓ 已写入 3 条 chapter_opened 学习事件')

  // 8b. demo.s2 提交一份待批阅作业：演示时教师端直接有批阅对象，不依赖现场先提交
  const s2Workspace = (await s2.request('GET', `/api/v1/assignments/${assignmentId}/workspace`)).data
  const s2Saved = (await s2.request('PUT', `/api/v1/assignments/${assignmentId}/workspace`, {
    baseRevision: s2Workspace.revision,
    files: [
      { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>我的主页</title>\n</head>\n<body>\n  <h1>我的主页</h1>\n  <p>这是一个测试页面。</p>\n</body>\n</html>\n' },
    ],
    activeFile: 'index.html',
  })).data
  const s2Subs = (await s2.request('GET', `/api/v1/assignments/${assignmentId}/submissions?page=1&pageSize=10`)).data
  let pendingSubmissionId = s2Subs.items?.[0]?.id ?? null
  if (!pendingSubmissionId) {
    const submission = (await s2.request('POST', `/api/v1/assignments/${assignmentId}/submissions`, {
      workspaceRevision: s2Saved.revision,
      reflection: '先交了结构骨架，样式和交互还没补。',
    })).data
    pendingSubmissionId = submission.id
    console.log(`✓ 已提交待批阅作业：${pendingSubmissionId}`)
  } else {
    console.log(`= 已有待批阅提交：${pendingSubmissionId}`)
  }

  // 9. 教师打分并发布评价
  const draftData = (await teacher.request('GET', `/api/v1/teacher/submissions/${submissionId}/feedback`)).data
  const existingFeedback = draftData.feedback
  let version = draftData.baseVersion ?? 0
  if (existingFeedback?.status !== 'published') {
    // 问题标签必须来自本班受控词表；词表为空时省略该字段
    const vocab = (await teacher.request('GET', `/api/v1/offerings/${offeringId}/issue-tags`)).data.items
    const issueTags = vocab.slice(0, 2).map((item) => item.tag)
    if (!issueTags.length) console.log('! 本班未配置问题标签词表，评价不带标签')
    const feedbackBody = {
      baseVersion: version,
      score: 88,
      rubricResults: [
        { criterionId: 'structure', score: 36, comment: '结构完整，语义标签使用得当。' },
        { criterionId: 'style', score: 27, comment: '窄屏下排版正常，可以再补一点层级对比。' },
        { criterionId: 'interaction', score: 25, comment: '表单校验可用，错误提示可以更具体。' },
      ],
      comment: '整体完成度高：结构语义清晰，Flex 布局在小屏下没有横向溢出。下一步把校验提示写得更具体，并补充一个空状态。',
      knowledgeEvaluations: [
        { knowledgePointId: pointIds[0], result: 'meets_expectation', note: '文档结构完整，meta 与 title 均正确。' },
        { knowledgePointId: pointIds[1], result: 'needs_practice', note: '标题层级正确，列表与链接的语义还可以更完整。' },
      ],
    }
    if (issueTags.length) feedbackBody.issueTags = issueTags
    const savedFeedback = (await teacher.request('POST', `/api/v1/teacher/submissions/${submissionId}/feedback`, feedbackBody)).data
    version = savedFeedback.version
    await teacher.request('POST', `/api/v1/teacher/submissions/${submissionId}/feedback/publish`, { baseVersion: version })
    console.log(`✓ 已发布评价（version ${version}）`)
  } else {
    console.log('= 评价已发布，跳过')
  }

  // 10. 数据自检：把演示要用的几个数字打出来，便于现场判断数据是否就绪
  const stats = (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/stats`)).data
  const activity = (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/activity?days=14`)).data
  const mastery = (await teacher.request('GET', `/api/v1/teacher/offerings/${offeringId}/knowledge-mastery`)).data
  const teacherSubmissions = (await teacher.request('GET', `/api/v1/teacher/assignments/${assignmentId}/submissions?page=1&pageSize=20`)).data
  const totals = activity.totals ?? {}
  const distribution = mastery.summary?.stateDistribution ?? mastery.summary ?? null
  console.log('✓ 自检：' +
    `学生 ${stats.studentCount} · 进行中作业 ${stats.activeAssignmentCount} · 待批阅 ${stats.pendingReviewCount} · ` +
    `活跃学生 ${totals.activeStudentCount ?? 0} · 章节打开 ${totals.chapterOpenedCount ?? 0} 次 · ` +
    `掌握分布 ${distribution ? JSON.stringify(distribution) : '未返回'} · 提交 ${teacherSubmissions.total} 条`)

  console.log('\n演示数据就绪：')
  console.log(JSON.stringify({
    baseUrl: BASE,
    origin: ORIGIN,
    offeringId,
    chapterIds,
    knowledgePointIds: pointIds,
    assignmentId,
    submissionId,
    inviteCode: invite.inviteCode,
    teacher: TEACHER,
    students: [{ username: 'demo.s1', password: DEMO_STUDENT_PASSWORD }, { username: 'demo.s2', password: DEMO_STUDENT_PASSWORD }],
    links: {
      teacherOffering: `/#/teacher/offerings/${offeringId}`,
      teacherAssignment: `/#/teacher/assignments/${assignmentId}`,
      teacherAnalytics: `/#/teacher/offerings/${offeringId}/analytics`,
      studentAssignments: '/#/student/assignments',
      studentProgress: `/#/student/progress/${offeringId}`,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error('\n✗ 演示数据准备失败：' + error.message)
  if (error.status === 503 || error.cause?.code === 'ECONNREFUSED') {
    console.error('  后端或数据库不可用：先恢复 Docker（MySQL 3307）并启动后端 8080。')
  }
  process.exitCode = 1
})
