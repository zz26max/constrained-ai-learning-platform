import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import {
  registerAssignmentsApi, registerAuthApi, registerCoursesApi,
  registerDashboardApi, registerNoticesApi, registerStatsApi,
} from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { AssignmentsApi } from '../src/api/assignments'
import { CoursesApi } from '../src/api/courses'
import { DashboardApi } from '../src/api/dashboard'
import { NoticesApi } from '../src/api/notices'
import { StatsApi } from '../src/api/stats'
import { targetRoute } from '../src/features/notifications/target-route'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, failEnvelope, okEnvelope, type ScriptedResponse, type ScriptedTransport, type ScriptHandler } from './helpers'

const OFFERING = '00000000-0000-4000-8000-000000000201'
const OFFERING_2 = '00000000-0000-4000-8000-000000000202'
const CHAPTER = '00000000-0000-4000-8000-000000000301'
const ASSIGNMENT = '00000000-0000-4000-8000-000000000701'
const ASSIGNMENT_2 = '00000000-0000-4000-8000-000000000702'
const FEEDBACK = '00000000-0000-4000-8000-000000000a01'
const NOTICE = '00000000-0000-4000-8000-000000000c01'
const TERM = '00000000-0000-4000-8000-000000000011'
const RESOURCE = '00000000-0000-4000-8000-000000000501'

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined
let dashboardOverride: Record<string, unknown> = {}
let noticeItems: unknown[] = []
let noticeDetail: Record<string, unknown> = {}
let learningRecords: ReturnType<typeof recordsFor> | null = null
let statsFails = false

const progress = { unit: 'assignment', completed: 3, total: 5, percent: 60, notConfigured: false, asOf: '2026-10-14T02:00:00Z' }
const course = (over: Record<string, unknown> = {}) => ({
  offeringId: OFFERING, courseId: '00000000-0000-4000-8000-000000000101', title: 'Web 前端开发技术', mark: 'WEB',
  groupName: '计算机 2301 班', termId: TERM, termLabel: '2026 秋季学期', status: 'active',
  teachers: [{ id: DEMO_USER.id, displayName: '李老师' }], currentChapter: null, progress, lastStudiedAt: null,
  pendingAssignmentCount: 0, unreadFeedbackCount: 0, ...over,
})
const summary = (id: string, over: Record<string, unknown> = {}) => ({
  id, offeringId: OFFERING, offeringStatus: 'active', chapterId: CHAPTER, title: '商品卡片布局', type: 'web_lab',
  isRequired: true, publicationState: 'published', description: '盒模型', dueAt: '2026-11-12T15:59:59Z',
  assignmentState: 'NOT_STARTED', overdue: false, latestSubmissionId: null, publishedFeedbackId: null,
  unreadFeedback: false, ...over,
})
const currentAssignment = (over: Record<string, unknown> = {}) => ({
  type: 'assignment', offeringId: OFFERING, chapterId: CHAPTER, assignmentId: ASSIGNMENT, title: '响应式导航栏',
  description: 'Flex', assignmentType: 'web_lab', assignmentState: 'IN_PROGRESS', dueAt: '2026-11-09T15:59:59Z',
  overdue: false, resume: null, ...over,
})
const feedback = (id: string, assignmentId: string, title: string) => ({
  id, submissionId: '00000000-0000-4000-8000-000000000801', offeringId: OFFERING, assignmentId, assignmentTitle: title,
  version: 1, status: 'published', score: 70, maxScore: 80, rubricResults: [{ criterionId: 'c1', score: 40, comment: '好' }],
  comment: '整体不错', knowledgeEvaluations: [], issueTags: [], issueTagVersion: null,
  teacher: { id: DEMO_USER.id, displayName: '李老师' }, publishedAt: '2026-10-14T05:00:00Z',
  messageId: '00000000-0000-4000-8000-000000000b01',
})

function dashboard() {
  return {
    termId: TERM, termLabel: '2026 秋季学期', serverTime: '2026-10-14T02:00:00Z', courseCount: 1,
    pendingAssignmentCount: 2, unreadMessageCount: 3, currentLearning: currentAssignment(),
    otherPendingAssignments: [], recentFeedback: null, courses: [course()], recentNotice: null,
    ...dashboardOverride,
  }
}

function recordsFor(count: number) {
  const items = Array.from({ length: count }, (_, i) => feedback(`00000000-0000-4000-8000-0000000f${String(i).padStart(4, '0')}`, ASSIGNMENT, `评价作业 ${i + 1}`))
  return {
    offeringId: OFFERING, summary: { completedLabCount: 2, publishedFeedbackCount: count, needsPracticeCount: null },
    recentFeedback: items[0] ?? null, feedbackPage: { items, page: 1, pageSize: 20, total: count },
    knowledgeEvidence: [], nextRecommendation: null,
  }
}

function normalResponse(request: Parameters<ScriptHandler>[0]): ScriptedResponse {
  switch (request.operationId) {
    case 'getDashboard': return okEnvelope(dashboard())
    case 'getMyLearningRecords': {
      const records = learningRecords ?? recordsFor(0)
      const query = new URL(request.path, 'http://localhost').searchParams
      const page = Number(query.get('page') ?? 1), pageSize = Number(query.get('pageSize') ?? 20)
      return okEnvelope({ ...records, feedbackPage: { ...records.feedbackPage, page, pageSize,
        items: records.feedbackPage.items.slice((page - 1) * pageSize, page * pageSize) } })
    }
    case 'listMyCourses': return okEnvelope({ items: [course(), course({ offeringId: OFFERING_2, title: '数据库' })], page: 1, pageSize: 50, total: 2 })
    case 'listNotices': return okEnvelope({ items: noticeItems, page: 1, pageSize: 20, total: noticeItems.length })
    case 'getNotice': return okEnvelope({ id: NOTICE, offeringId: OFFERING, title: '公告', content: '', target: null, createdAt: '2026-10-14T02:00:00Z', recipientCount: 1, ...noticeDetail })
    case 'getFeedback': return okEnvelope(feedback(FEEDBACK, ASSIGNMENT, '作业'))
    case 'listMessages': return okEnvelope({ items: [], page: 1, pageSize: 20, total: 0, summary: { unreadCount: 0 } })
    case 'listMyAssignments': return okEnvelope({ items: [
      summary(ASSIGNMENT, { publicationState: 'archived', title: '旧实验' }),
      summary(ASSIGNMENT_2, { overdue: true, title: '逾期实验' }),
    ], summary: { allCount: 2 } })
    case 'getOffering': return okEnvelope({
      id: OFFERING, courseId: '00000000-0000-4000-8000-000000000101', title: 'Web 前端开发技术', groupName: '计算机 2301 班',
      termId: TERM, termLabel: '2026 秋季学期', status: 'active', teachers: [{ id: DEMO_USER.id, displayName: '李老师' }],
    })
    case 'getOfferingStats':
      return statsFails ? failEnvelope(500, 'INTERNAL_ERROR', {}, 'req-stats') : okEnvelope({ studentCount: 30, activeAssignmentCount: 4, pendingReviewCount: 5, pendingHelpCount: 0 })
    case 'getWorkspace': return okEnvelope({
      assignmentId: ASSIGNMENT, revision: 1, files: [{ path: 'index.html', content: '<p></p>' }], activeFile: 'index.html',
      savedAt: '2026-10-14T02:00:00Z', canSave: false, saveBlockedReason: 'ASSIGNMENT_ARCHIVED',
    })
    default: return okEnvelope({ offeringId: OFFERING, items: [], page: 1, pageSize: 20, total: 0 })
  }
}

const requestsOf = (operationId: string) => scripted.requests.filter(request => request.operationId === operationId)

async function open(path: string, role: 'student' | 'teacher' = 'student'): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: `csrf-${role}`,
    identity: { ...DEMO_USER, roles: [role] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  dashboardOverride = {}
  noticeItems = []
  noticeDetail = {}
  learningRecords = null
  statsFails = false
  scripted = createScriptedTransport()
  scripted.setHandler(normalResponse)
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
  registerAssignmentsApi(new AssignmentsApi(client))
  registerDashboardApi(new DashboardApi(client))
  registerNoticesApi(new NoticesApi(client))
  registerStatsApi(new StatsApi(client))
})

afterEach(() => {
  wrapper?.unmount()
  router?.options.history.destroy()
  wrapper = undefined
  router = undefined
  document.body.innerHTML = ''
})

describe('P1-D 路由与首页', () => {
  it('知学导航只高亮当前栏目，单角色无演示切换，调试入口不出现在菜单', async () => {
    const page = await open('/student/home')
    expect(page.find('.workspace-brand').text()).toContain('知学')
    expect(page.findAll('nav[aria-label="主导航"] [aria-current="page"]')).toHaveLength(1)
    expect(page.find('nav[aria-label="主导航"] [aria-current="page"]').text()).toBe('学习首页')
    expect(page.find('.role-select').exists()).toBe(false)
    expect(page.find('nav[aria-label="主导航"]').text()).not.toContain('会话调试')
    useAuthStore().$patch({identity: {...DEMO_USER, roles:['student','teacher']}})
    await flushPromises()
    expect(page.find('.role-select select').exists()).toBe(true)
  })
  it('1. 学生登录后 / 重定向到 /student/home', async () => {
    await open('/')
    expect(router?.currentRoute.value.path).toBe('/student/home')
    expect(requestsOf('getDashboard')).toHaveLength(1)
  })

  it('2. currentLearning 三种分支渲染正确按钮与链接，逾期显示文字', async () => {
    const assignmentPage = await open('/student/home')
    const continueLink = assignmentPage.findAll('a').find(item => item.text() === '继续作业')
    expect(continueLink?.attributes('href')).toBe(`/student/assignments/${ASSIGNMENT}`)
    expect(assignmentPage.text()).not.toContain('已逾期')
    wrapper?.unmount()

    dashboardOverride = { currentLearning: currentAssignment({ overdue: true, resume: { activeFile: 'index.html', savedAt: '2026-10-14T01:00:00Z', workspaceRevision: 2 } }) }
    const overduePage = await open('/student/home')
    expect(overduePage.text()).toContain('继续上次的工作')
    expect(overduePage.text()).toContain('已逾期')
    wrapper?.unmount()

    dashboardOverride = { currentLearning: { type: 'chapter', offeringId: OFFERING, chapterId: CHAPTER, title: '第三章', description: '布局' } }
    const chapterPage = await open('/student/home')
    const chapterLink = chapterPage.findAll('a').find(item => item.text() === '继续学习')
    expect(chapterLink?.attributes('href')).toBe(`/course/${OFFERING}/chapter/${CHAPTER}`)
    wrapper?.unmount()

    dashboardOverride = { currentLearning: null }
    const emptyPage = await open('/student/home')
    expect(emptyPage.text()).toContain('暂无待完成任务')
    expect(emptyPage.findAll('a').find(item => item.text() === '查看我的课程')?.attributes('href')).toBe('/course')
  })

  it('3. termId 为 null 显示无学期提示；notConfigured 不显示 0%', async () => {
    dashboardOverride = {
      termId: null, termLabel: null, currentLearning: null, courseCount: 0, courses: [],
    }
    const noTerm = await open('/student/home')
    expect(noTerm.text()).toContain('当前没有进行中的学期')
    wrapper?.unmount()

    dashboardOverride = { courses: [course({ progress: { ...progress, completed: 0, total: 0, percent: 0, notConfigured: true } })] }
    const notConfigured = await open('/student/home')
    expect(notConfigured.text()).toContain('未配置学习内容')
    expect(notConfigured.text()).not.toContain('0%')
  })

  it('4. 首页接口失败显示错误、requestId 和重试，不显示空状态', async () => {
    scripted.setHandler(request => request.operationId === 'getDashboard'
      ? failEnvelope(500, 'INTERNAL_ERROR', {}, 'req-dash-fail')
      : normalResponse(request))
    const page = await open('/student/home')
    expect(page.text()).toContain('requestId: req-dash-fail')
    expect(page.text()).toContain('重新加载')
    expect(page.text()).not.toContain('暂无待完成任务')
    expect(page.text()).not.toContain('当前没有进行中的学期')
  })
})

describe('P1-D 学习记录', () => {
  it('5a. P2 字段显示阶段说明，needsPracticeCount 为 null 不显示 0', async () => {
    learningRecords = recordsFor(1)
    const page = await open(`/student/progress/${OFFERING}`)
    expect(page.text()).toContain('P2 开放')
    expect(page.text()).toContain('知识点掌握分析将在 P2 开放')
    expect(page.text()).toContain('评价作业 1')
  })

  it('5b. 超过 20 份评价向服务端请求第三页，汇总和最近评价保持不变', async () => {
    learningRecords = recordsFor(23)
    const page = await open(`/student/progress/${OFFERING}`)
    expect(page.text()).toContain('第 1 / 3 页')
    const next = page.findAll('button').find(item => item.text() === '下一页')
    await next?.trigger('click')
    await flushPromises()
    expect(router?.currentRoute.value.query['page']).toBe('2')
    expect(page.text()).toContain('第 2 / 3 页')
    expect(page.text()).toContain('评价作业 11')
    await page.findAll('button').find(item => item.text() === '下一页')?.trigger('click')
    await flushPromises()
    expect(page.text()).toContain('评价作业 23')
    expect(page.text()).toContain('第 3 / 3 页')
    expect(requestsOf('getMyLearningRecords').at(-1)?.path).toContain('page=3&pageSize=10')
    expect(page.text()).toContain('23 份评价已发布')
  })

  it('5c. 非法 offeringId 不发请求并显示链接无效', async () => {
    const page = await open('/student/progress/not-a-uuid')
    expect(page.text()).toContain('链接无效')
    expect(requestsOf('getMyLearningRecords')).toHaveLength(0)
    expect(requestsOf('listMyCourses')).toHaveLength(0)
  })

  it('5d. 无参页列出教学班，点选后进入对应记录页', async () => {
    const page = await open('/student/progress')
    expect(page.text()).toContain('数据库')
    const link = page.findAll('a').find(item => item.text() === '数据库')
    await link?.trigger('click')
    await flushPromises()
    expect(router?.currentRoute.value.path).toBe(`/student/progress/${OFFERING_2}`)
  })

  it('5e. 403/404 显示无法查看并给出返回入口', async () => {
    scripted.setHandler(request => request.operationId === 'getMyLearningRecords'
      ? failEnvelope(404, 'NOT_FOUND', {}, 'req-lr-404')
      : normalResponse(request))
    const page = await open(`/student/progress/${OFFERING}`)
    expect(page.text()).toContain('无法查看该教学班的学习记录')
    expect(page.findAll('a').some(item => item.attributes('href') === '/student/progress')).toBe(true)
  })
})

describe('P1-D 公告', () => {
  it('6a. 公告列表空状态', async () => {
    const page = await open(`/student/offerings/${OFFERING}/notices`)
    expect(page.text()).toContain('本课程暂无公告')
  })

  it('6b. 公告列表截断正文，详情中的 script 以文本出现', async () => {
    const evil = '<script>alert(1)</script>'
    noticeItems = [{ id: NOTICE, offeringId: OFFERING, title: '重要', content: `${evil}${'a'.repeat(200)}`, target: null, createdAt: '2026-10-14T02:00:00Z', recipientCount: 1 }]
    const list = await open(`/student/offerings/${OFFERING}/notices`)
    expect(list.text()).toContain('…')
    expect(list.find('.notice-list script').exists()).toBe(false)
    wrapper?.unmount()

    noticeDetail = { title: '重要', content: `第一行\n${evil}` }
    const detail = await open(`/student/notices/${NOTICE}`)
    expect(detail.text()).toContain(evil)
    expect(detail.find('.notice-content script').exists()).toBe(false)
    expect(detail.find('.notice-content').element.innerHTML).not.toContain('<script>')
    expect(detail.text()).not.toContain('recipientCount')
  })
})

describe('P1-D 消息目标映射', () => {
  it.each([
    { role: 'student' as const, path: '/student/assignments', operation: 'listMyAssignments' },
    { role: 'teacher' as const, path: `/teacher/offerings/${OFFERING}/assignments`, operation: 'listTeacherAssignments' },
  ])('$role 超过 20 项作业可请求第二页并保留 URL 页码', async ({ role, path, operation }) => {
    const items = Array.from({ length: 23 }, (_, i) => summary(`00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, { title: `分页作业${i + 1}` }))
    scripted.setHandler(request => {
      if (request.operationId !== operation) return normalResponse(request)
      const params = new URL(request.path, 'http://localhost').searchParams
      const page = Number(params.get('page') ?? 1)
      return okEnvelope({ items: items.slice((page - 1) * 20, page * 20), page, pageSize: 20, total: 23, summary: { allCount: 23 } })
    })
    const page = await open(path, role)
    const next = page.findAll('button').find(button => button.text() === '下一页')
    expect(next).toBeDefined()
    await next!.trigger('click')
    await flushPromises()
    expect(router?.currentRoute.value.query.page).toBe('2')
    expect(requestsOf(operation).at(-1)?.path).toContain('page=2&pageSize=20')
    expect(page.text()).toContain('分页作业23')
    expect(page.text()).not.toContain('分页作业20')
  })
  it('空 target 的课程公告进入本班公告列表，打开不标读', async () => {
    scripted.setHandler(request => request.operationId === 'listMessages'
      ? okEnvelope({ items: [{ id: NOTICE, offeringId: OFFERING, type: 'course_notice', title: '历史公告',
        content: '公告正文', target: null, sender: null, createdAt: '2026-10-14T02:00:00Z', readAt: null }],
        page: 1, pageSize: 20, total: 1, summary: { unreadCount: 1 } })
      : normalResponse(request))
    const page = await open('/student/messages')
    const view = page.findAll('button').find(button => button.text() === '查看')
    expect(view).toBeDefined()
    await view!.trigger('click')
    await flushPromises()
    expect(router?.currentRoute.value.fullPath).toBe(`/student/offerings/${OFFERING}/notices`)
    expect(requestsOf('listNotices')).toHaveLength(1)
    expect(requestsOf('readMessage')).toHaveLength(0)
  })
  it('7. targetRoute 覆盖六种 type 与非法 UUID', () => {
    const t = (type: string, id = RESOURCE, offeringId = OFFERING) => targetRoute({ type, id, offeringId } as never)
    expect(t('offering', OFFERING)).toEqual({ name: 'course', params: { offeringId: OFFERING } })
    expect(t('chapter', CHAPTER)).toEqual({ name: 'chapter', params: { offeringId: OFFERING, chapterId: CHAPTER } })
    expect(t('resource', RESOURCE)).toEqual({ name: 'resource', params: { resourceId: RESOURCE } })
    expect(t('assignment', ASSIGNMENT)).toEqual({ name: 'student-assignment', params: { id: ASSIGNMENT } })
    expect(t('feedback', FEEDBACK)).toBe('needs-feedback-lookup')
    expect(t('help_request')).toBeNull()
    expect(t('assignment', 'not-a-uuid')).toBeNull()
    expect(t('assignment', ASSIGNMENT, '../evil')).toBeNull()
  })
})

describe('P1-D 教师统计卡片', () => {
  it('8a. 成功时显示四张卡片', async () => {
    const page = await open(`/teacher/offerings/${OFFERING}`, 'teacher')
    const cards = page.find('.stat-cards')
    expect(cards.text()).toContain('30')
    expect(cards.text()).toContain('P2 开放')
    expect(cards.findAll('a').some(item => item.attributes('href') === `/teacher/offerings/${OFFERING}/assignments`)).toBe(true)
  })

  it('8b. 统计失败只影响卡片区，工作台其余部分正常', async () => {
    statsFails = true
    const page = await open(`/teacher/offerings/${OFFERING}`, 'teacher')
    expect(page.find('.stat-cards').text()).toContain('requestId: req-stats')
    expect(page.find('h1').text()).toBe('Web 前端开发技术')
    expect(page.text()).toContain('章节与资料')
  })

  it('8c. 教师公告入口可发布并关联本课程，归档班级保持只读', async () => {
    const page = await open(`/teacher/offerings/${OFFERING}`, 'teacher')
    await page.findAll('button').find(item => item.text() === '公告')?.trigger('click')
    await flushPromises()
    expect(page.text()).toContain('课程公告')
    await page.findAll('button').find(item => item.text() === '发布公告')?.trigger('click')
    await page.find('form input').setValue('本周公告')
    await page.find('form textarea').setValue('请查看本周课程安排。')
    await page.find('form select').setValue('offering')
    await page.find('form').trigger('submit')
    await flushPromises()
    const request = requestsOf('createNotice').at(-1)
    expect(request?.headers['X-CSRF-Token']).toBe('csrf-teacher')
    expect(JSON.parse(request?.body ?? '{}')).toMatchObject({ title: '本周公告', content: '请查看本周课程安排。', target: { type: 'offering', id: OFFERING, offeringId: OFFERING } })
    expect(page.text()).toContain('公告已发布')
  })
})

describe('P1-D 只读加载', () => {
  it('9. 首页、公告、学习记录加载后无已读写请求', async () => {
    for (const path of ['/student/home', `/student/offerings/${OFFERING}/notices`, `/student/notices/${NOTICE}`, `/student/progress/${OFFERING}`]) {
      await open(path)
      wrapper?.unmount()
    }
    const writes = scripted.requests.filter(request => request.operationId === 'markMessagesAsRead' || request.operationId === 'readMessage')
    expect(writes).toHaveLength(0)
    expect(scripted.requests.every(request => request.method === 'GET')).toBe(true)
  })
})

describe('P1-D 归档与期限', () => {
  it('10a. 作业列表显示已归档与已逾期文字标签', async () => {
    const page = await open('/student/assignments')
    expect(page.text()).toContain('已归档')
    expect(page.text()).toContain('已逾期')
  })

  it('10b. 归档作业工作区提示只读且提交按钮遵循 canSave 禁用', async () => {
    const page = await open(`/student/workspaces/${ASSIGNMENT}`)
    expect(page.text()).toContain('作业已归档')
    const submit = page.findAll('button').find(item => item.text() === '提交作业')
    expect(submit?.attributes('disabled')).toBeDefined()
  })

  it('10c. 作业详情展示后端 submissionBlockedReason，不自行推断', async () => {
    scripted.setHandler(request => request.operationId === 'getAssignment'
      ? okEnvelope({
        ...summary(ASSIGNMENT), requirements: [], estimatedMinutes: 60, maxScore: 80, rubric: [], knowledgePointIds: [],
        lateUntil: null, allowResubmit: false, maxAttempts: 1, attemptsUsed: 1, canSubmit: false,
        submissionBlockedReason: 'ATTEMPT_LIMIT_REACHED', aiPolicyVersion: 1, dueAt: null,
      })
      : normalResponse(request))
    const page = await open(`/student/assignments/${ASSIGNMENT}`)
    expect(page.text()).toContain('提交次数已用完')
    expect(page.text()).toContain('无截止时间')
  })
})
