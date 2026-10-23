import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import HistoricalHome from '../src/features/dashboard/StudentHomePage.vue'
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
    case 'listMyCourses': {const items=(dashboardOverride.courses as unknown[]|undefined)??[course(),course({offeringId:OFFERING_2,title:'数据库'})];return okEnvelope({items,page:1,pageSize:100,total:items.length})}
    case 'listNotices': return okEnvelope({ items: noticeItems, page: 1, pageSize: 20, total: noticeItems.length })
    case 'getNotice': return okEnvelope({ id: NOTICE, offeringId: OFFERING, title: '公告', content: '', target: null, createdAt: '2026-10-14T02:00:00Z', recipientCount: 1, ...noticeDetail })
    case 'getFeedback': return okEnvelope(feedback(FEEDBACK, ASSIGNMENT, '作业'))
    case 'listMessages': return okEnvelope({ items: [], page: 1, pageSize: 20, total: 0, summary: { unreadCount: 0 } })
    case 'listMyAssignments': return okEnvelope({ items: [
      summary(ASSIGNMENT, { publicationState: 'archived', title: '旧实验' }),
      summary(ASSIGNMENT_2, { overdue: true, title: '逾期实验',dueAt:'2026-10-01T00:00:00Z' }),
    ], page:1,pageSize:100,total:2, summary: { allCount: 2 } })
    case 'getAssignment': return okEnvelope({...summary(request.path.split('/').at(-1)!,{title:'逾期实验'}),canSubmit:true,submissionBlockedReason:null})
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

async function open(path: string, role: 'student' | 'teacher' = 'student', historical = false): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: `csrf-${role}`,
    identity: { ...DEMO_USER, roles: [role] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  if(historical)router.addRoute({name:'student-home',path:'/student/home',component:HistoricalHome,meta:{requiresAuth:true,requiresRole:'student'}})
  await router.push(path)
  await router.isReady()
  wrapper = mount(App, { props:{studentVisual:true}, attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

// Historical design tests mount the preserved page explicitly, never enable it in production.
const openLegacy=(path:string)=>open(path,'student',true)

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

  it('正式首页使用服务端资格而非看板旧任务，明确补交及排序依据',async()=>{
    scripted.setHandler(r=>r.operationId==='getAssignment'?okEnvelope({...summary(ASSIGNMENT_2,{title:'真实补交任务',overdue:true}),canSubmit:true}):normalResponse(r))
    const view=await open('/student/home')
    expect(view.get('#explore-focus-title').text()).toBe('真实补交任务')
    expect(view.get('.explore-focus').text()).toContain('已逾期，可补交')
    expect(view.get('[data-home-action=primary]').text()).toContain('继续补交')
    expect(view.get('[data-home-action=primary]').attributes('href')).toBe('/student/workspaces/'+ASSIGNMENT_2)
    expect(view.get('.polish-task-context').text()).toContain('截止时间先后')
  })
  it('正式首页资格失败不能展示成功空态，课程章节失败可重试',async()=>{
    scripted.setHandler(r=>r.operationId==='getAssignment'?failEnvelope(503,'SERVICE_UNAVAILABLE',{},'req-permission'):r.operationId==='listChapters'?failEnvelope(503,'SERVICE_UNAVAILABLE',{},'req-chapters'):normalResponse(r))
    const view=await open('/student/home')
    expect(view.get('.explore-focus').text()).toContain('req-permission')
    expect(view.get('.explore-focus').text()).not.toContain('当前没有可提交的待办')
    expect(view.find('[data-home-action=primary]').exists()).toBe(false)
    expect(view.get('.explore-courses').text()).toContain('课程未完整加载')
    wrapper?.unmount()
    scripted.setHandler(r=>r.operationId==='listChapters'?failEnvelope(503,'SERVICE_UNAVAILABLE',{},'req-chapters'):normalResponse(r))
    const chapters=await open('/student/home')
    expect(chapters.get('.explore-courses').text()).toContain('req-chapters')
    expect(chapters.get('.bplus-course-action').text()).toContain('查看课程')
  })
  it('正式首页无资格待办时保留课程入口，不虚构学习进度',async()=>{
    scripted.setHandler(r=>r.operationId==='getAssignment'?okEnvelope({...summary(ASSIGNMENT_2),canSubmit:false}):normalResponse(r))
    const view=await open('/student/home')
    expect(view.get('#explore-focus-title').text()).toBe('当前没有可提交的待办')
    expect(view.get('[data-home-action=primary]').attributes('href')).toBe('/course/'+OFFERING)
    expect(view.find('[role=progressbar]').exists()).toBe(false)
  })

  it('正式课程保留真实空态与读取错误，不用空课程掩盖失败',async()=>{
    scripted.setHandler(r=>r.operationId==='listMyCourses'?okEnvelope({items:[],page:1,pageSize:100,total:0}):normalResponse(r))
    const empty=await open('/course');expect(empty.text()).toContain('暂无符合条件的课程');expect(empty.find('.student-release').exists()).toBe(true)
    wrapper?.unmount()
    scripted.setHandler(r=>r.operationId==='listMyCourses'?failEnvelope(503,'SERVICE_UNAVAILABLE',{},'req-course-failure'):normalResponse(r))
    const failed=await open('/course');expect(failed.text()).toContain('req-course-failure');expect(failed.text()).not.toContain('暂无符合条件的课程')
  })
  it('教师日历保持原页面且不获得学生视觉容器',async()=>{
    const teacher=await open('/teacher/calendar','teacher')
    expect(teacher.get('main h1').text()).toBe('教学日历')
    expect(teacher.find('.student-release').exists()).toBe(false)
    expect(teacher.find('.vx-calendar').exists()).toBe(false)
  })
  it('1. 学生登录后 / 重定向到 /student/home', async () => {
    await open('/')
    expect(router?.currentRoute.value.path).toBe('/student/home')
    expect(requestsOf('getDashboard')).toHaveLength(1)
  })

  it('首页方案切换共用同一份真实查询与任务，未知参数保留原版',async()=>{
    const view=await openLegacy('/student/home?design=current')
    const dashReads=requestsOf('getDashboard').length, taskReads=requestsOf('listMyAssignments').length
    const originalTitle=view.find('.current-task h3').text()
    await view.find('.home-preview-switch a[href="/student/home?design=a"]').trigger('click');await flushPromises()
    expect(view.find('[data-design="a"]').exists()).toBe(true)
    expect(view.find('#explore-focus-title').text()).toBe(originalTitle)
    const first=view.find('[data-home-action="primary"]').attributes('data-task-id')
    const courses=view.findAll('[data-course-id]').map(c=>c.attributes('data-course-id'))
    await view.find('.home-preview-switch a[href="/student/home?design=b"]').trigger('click');await flushPromises()
    expect(view.find('[data-design="b"]').exists()).toBe(true)
    expect(view.find('[data-home-action="primary"]').attributes('data-task-id')).toBe(first)
    expect(view.findAll('[data-course-id]').map(c=>c.attributes('data-course-id'))).toEqual(courses)
    expect(requestsOf('getDashboard')).toHaveLength(dashReads)
    expect(requestsOf('listMyAssignments')).toHaveLength(taskReads)
    await router!.push('/student/home?design=unknown');await flushPromises()
    expect(view.find('.dashboard-page').exists()).toBe(true)
  })
  it.each(['a','b'])('方案%s无资格任务与无反馈公告时保留可用空态',async design=>{
    dashboardOverride={recentFeedback:null,recentNotice:null}
    scripted.setHandler(r=>r.operationId==='getAssignment'?okEnvelope({...summary(ASSIGNMENT_2),canSubmit:false}):normalResponse(r))
    const view=await openLegacy('/student/home?design='+design)
    expect(view.find('#explore-focus-title').text()).toBe('当前没有可提交的待办')
    expect(view.find('[data-home-action="primary"]').attributes('href')).toBe('/course')
    expect(view.find('[data-home-action="primary"]').attributes('data-task-id')).toBeUndefined()
    expect(view.text()).toContain('暂无已发布的评价')
    expect(view.text()).toContain('暂无课程公告')
  })
  it('B+按同一截止时间分组，任务保持独立入口且只显示最近一门课程',async()=>{
    const tasks=[summary(ASSIGNMENT,{dueAt:'2026-10-21T00:00:00Z'}),...['2','3','4'].map(n=>summary(`00000000-0000-4000-8000-00000000070${n}`,{title:`同组任务${n}`,dueAt:'2026-10-24T14:00:00Z'}))]
    scripted.setHandler(r=>{
      if(r.operationId==='listMyAssignments')return okEnvelope({items:tasks,total:tasks.length,page:1,pageSize:100})
      if(r.operationId==='getAssignment')return okEnvelope({...tasks.find(t=>r.path.endsWith(t.id)),canSubmit:true})
      return normalResponse(r)
    })
    const view=await openLegacy('/student/home?design=bplus')
    expect(view.find('[data-design="bplus"]').exists()).toBe(true)
    expect(view.findAll('.bplus-group-heading')).toHaveLength(1)
    expect(view.find('.bplus-group-heading').text()).toContain('3 项任务')
    expect(view.findAll('.bplus-task-list [data-task-id]')).toHaveLength(3)
    expect(view.findAll('[data-course-id]')).toHaveLength(1)
    expect(view.find('.explore-focus').findAll('time')).toHaveLength(1)
    expect(view.findAll('.bplus-task-list time')).toHaveLength(0)
    expect(view.findAll('.bplus-task-list a.task-line-action')).toHaveLength(3)
  })
  it.each([
    {status:'completed',label:'复习章节',id:CHAPTER},
    {status:'not_started',label:'继续学习',id:CHAPTER},
    {status:null,label:'查看课程',id:null},
    {status:'empty',label:'查看课程',id:null},
  ])('B+真实章节状态$status决定$label，不用课程摘要100%冒充阅读结论',async({status,label,id})=>{
    dashboardOverride={courses:[course({currentChapter:{id:CHAPTER,number:1,title:'真实章节'},progress:{...progress,percent:100,completed:5}})]}
    scripted.setHandler(r=>r.operationId==='listChapters'?okEnvelope({offeringId:OFFERING,items:status==='empty'?[]:[{id:CHAPTER,number:1,title:'真实章节',publicationState:'published',studentProgress:status?{status}:null}]}):normalResponse(r))
    const view=await openLegacy('/student/home?design=bplus')
    const link=view.find('.bplus-course-action')
    expect(link.text()).toContain(label)
    expect(link.attributes('href')).toBe(id?`/course/${OFFERING}/chapter/${id}`:`/course/${OFFERING}`)
    expect(view.find('.explore-courses').text()).not.toContain('已结课')
    if(status==='completed')expect(view.text()).toContain('后续内容以教师发布为准')
  })
  it('B+章节读取失败不显示伪造进度，保留重试和查看课程',async()=>{
    scripted.setHandler(r=>r.operationId==='listChapters'?failEnvelope(503,'SERVICE_UNAVAILABLE'):normalResponse(r))
    const view=await openLegacy('/student/home?design=bplus')
    expect(view.find('.explore-courses').text()).toContain('重新加载')
    expect(view.find('.bplus-course-action').text()).toContain('查看课程')
    expect(view.find('.explore-courses [role="progressbar"]').exists()).toBe(false)
  })
  it('正式首页忽略旧探索参数，不显示评审控件',async()=>{
    const view=await open('/student/home')
    expect(view.find('.home-preview-switch').exists()).toBe(false)
    await router!.push('/student/home?design=current');await flushPromises()
    expect(view.find('.home-preview-switch').exists()).toBe(false)
    expect(view.find('.sr-home').exists()).toBe(true)
  })
  it('B+空任务、空课程与无反馈公告时不虚构学习信息',async()=>{
    dashboardOverride={courseCount:0,pendingAssignmentCount:0,unreadMessageCount:0,courses:[],currentLearning:null,recentFeedback:null,recentNotice:null}
    scripted.setHandler(r=>r.operationId==='listMyAssignments'?okEnvelope({items:[],total:0,page:1,pageSize:100}):normalResponse(r))
    const view=await openLegacy('/student/home?design=bplus')
    expect(view.find('#explore-focus-title').text()).toBe('当前没有可提交的待办')
    expect(view.find('[data-home-action="primary"]').attributes('href')).toBe('/course')
    expect(view.text()).toContain('本学期暂无课程')
    expect(view.text()).toContain('暂无已发布的评价')
    expect(view.text()).toContain('暂无课程公告')
    expect(view.find('.bplus-deadline').exists()).toBe(false)
    expect(view.find('[role="progressbar"]').exists()).toBe(false)
    expect(requestsOf('listChapters')).toHaveLength(0)
  })
  it('正式首页默认采用B+且不显示探索入口',async()=>{
    const view=await open('/student/home')
    expect(view.find('[data-design="bplus"]').exists()).toBe(true)
    expect(view.find('.home-preview-switch').exists()).toBe(false)
    expect(view.find('[data-home-action="primary"]').attributes('href')).toContain(ASSIGNMENT_2)
  })
  it('2. 首屏优先可提交任务，不能用看板旧任务覆盖资格检查', async () => {
    const page=await openLegacy('/student/home?design=current')
    expect(page.find('#dash-current').text()).toBe('接下来要做')
    expect(page.find('.current-task').text()).toContain('逾期实验')
    expect(page.find('.current-task').text()).not.toContain('响应式导航栏')
    expect(page.find('.current-task a.button').text()).toBe('开始作答')
    expect(page.find('.current-task a.button').attributes('href')).toContain(ASSIGNMENT_2)
    expect(page.element.innerHTML.indexOf('接下来要做')).toBeLessThan(page.element.innerHTML.indexOf('学习概览'))
  })
  it('2b. 无可提交任务时给出课程入口；资格读取失败不显示成功空态',async()=>{
    scripted.setHandler(r=>r.operationId==='getAssignment'?okEnvelope({...summary(ASSIGNMENT_2),canSubmit:false}):normalResponse(r))
    const page=await openLegacy('/student/home?design=current')
    expect(page.find('.current-task').text()).toContain('当前没有可提交的待办')
    expect(page.find('.current-task a.button').attributes('href')).toBe('/course')
    wrapper?.unmount()
    scripted.setHandler(r=>r.operationId==='getAssignment'?failEnvelope(503,'SERVICE_UNAVAILABLE'):normalResponse(r))
    const failed=await openLegacy('/student/home?design=current')
    expect(failed.find('.current-task').text()).not.toContain('当前没有可提交的待办')
    expect(failed.find('.current-task').text()).toContain('重新加载')
  })

  it('3. termId 为 null 显示无学期提示；notConfigured 不显示 0%', async () => {
    dashboardOverride = {
      termId: null, termLabel: null, currentLearning: null, courseCount: 0, courses: [],
    }
    const noTerm = await openLegacy('/student/home?design=current')
    expect(noTerm.text()).toContain('当前没有进行中的学期')
    wrapper?.unmount()

    dashboardOverride = { courses: [course({ progress: { ...progress, completed: 0, total: 0, percent: 0, notConfigured: true } })] }
    const notConfigured = await openLegacy('/student/home?design=current')
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
        expect(page.text()).not.toContain('P2 开放')
    expect(page.text()).toContain('评价作业 1')
  })

  it('最近反馈仅按ID去重，同标题不同反馈仍独立呈现',async()=>{
    learningRecords=recordsFor(2)
    learningRecords.feedbackPage.items[1]!.assignmentTitle=learningRecords.feedbackPage.items[0]!.assignmentTitle
    const view=await open(`/student/progress/${OFFERING}`)
    const links=view.findAll('main a').filter(n=>n.attributes('href')?.includes('feedbackId='))
    expect(links).toHaveLength(2)
    expect(new Set(links.map(n=>n.attributes('href'))).size).toBe(2)
    expect(view.find('.vx-feedback').text()).toContain('整体不错')
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
    expect(page.get('.vx-results').text()).toContain('已发布评价23份')
  })

  it('5c. 非法 offeringId 不发请求并显示链接无效', async () => {
    const page = await open('/student/progress/not-a-uuid')
    expect(page.text()).toContain('链接无效')
    expect(requestsOf('getMyLearningRecords')).toHaveLength(0)
    expect(requestsOf('listMyCourses')).toHaveLength(1)
  })

  it('5d. 无参页默认最近课程，并可用选择器切换', async () => {
    const page = await open('/student/progress')
    expect(router?.currentRoute.value.path).toBe(`/student/progress/${OFFERING}`)
    await page.find('select').setValue(OFFERING_2)
    await flushPromises()
    expect(router?.currentRoute.value.path).toBe(`/student/progress/${OFFERING_2}`)
    expect(page.text()).toContain('章节学习路径')
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
    expect(requestsOf(operation).at(-1)?.path).toContain(role==='student'?'page=2&pageSize=100':'page=2&pageSize=20')
    expect(page.text()).toContain('分页作业23')
    expect(page.text()).not.toContain('分页作业20')
  })
  it('学生作业组合筛选覆盖完整数据，筛选重置页码，空结果可清除',async()=>{
    const items=Array.from({length:43},(_,i)=>summary(`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,{title:`任务${i}`,offeringId:i<23?OFFERING:OFFERING_2,assignmentState:i%2?'SUBMITTED':'NOT_STARTED'}))
    scripted.setHandler(r=>r.operationId==='listMyAssignments'?okEnvelope({items,total:items.length,page:1,pageSize:100}):normalResponse(r))
    const view=await open('/student/assignments?status=all&page=2')
    expect(view.findAll('.task-table-row')).toHaveLength(20)
    await view.findAll('.filter-tabs button').find(b=>b.text().startsWith('已提交'))!.trigger('click');await flushPromises()
    expect(router?.currentRoute.value.query.page).toBe('1')
    expect(view.findAll('.task-table-row')).toHaveLength(20)
    await view.findAll('select')[0]!.setValue(OFFERING_2);await flushPromises()
    expect(view.findAll('.task-table-row')).toHaveLength(10)
    expect(view.findAll('.task-table-row').every(row=>row.text().includes('数据库'))).toBe(true)
    await view.findAll('.filter-tabs button').find(b=>b.text().startsWith('已批改'))!.trigger('click');await flushPromises()
    expect(view.text()).toContain('暂无符合条件的作业')
    await view.findAll('button').find(b=>b.text()==='清除筛选')!.trigger('click');await flushPromises()
    expect(router?.currentRoute.value.query.status).toBe('all')
    expect(view.findAll('.task-table-row')).toHaveLength(20)
  })
  it('待办资格跨API页全量读取后排序再分页，补交仍优先，数量不变',async()=>{
    const items=Array.from({length:105},(_,i)=>summary(`00000000-0000-4000-8000-${String(1000+i).padStart(12,'0')}`,{title:'任务'+i,offeringId:i%2?OFFERING_2:OFFERING,dueAt:i===104?'2026-12-01T00:00:00Z':'2026-01-01T00:00:00Z',overdue:i!==104}))
    scripted.setHandler(r=>{
      if(r.operationId==='listMyAssignments'){
        const page=Number(new URL(r.path,'http://localhost').searchParams.get('page')??1)
        return okEnvelope({items:items.slice((page-1)*100,page*100),total:105,page,pageSize:100})
      }
      if(r.operationId==='getAssignment'){
        const t=items.find(t=>r.path.endsWith(t.id))!
        return okEnvelope({...t,canSubmit:items.indexOf(t)>=103,submissionBlockedReason:items.indexOf(t)>=103?null:'SUBMISSION_CLOSED'})
      }
      return normalResponse(r)
    })
    const view=await open('/student/assignments')
    for(let i=0;i<25;i++)await flushPromises()
    expect(requestsOf('listMyAssignments')).toHaveLength(2)
    expect(requestsOf('getAssignment')).toHaveLength(105)
    expect(view.findAll('.task-title').slice(0,2).map(n=>n.text())).toEqual(['任务103','任务104'])
    expect(view.findAll('.task-table-row')[0]!.text()).toContain('继续补交')
    expect(view.findAll('.task-table-row')[2]!.text()).toContain('查看详情')
    expect(view.findAll('.task-group-heading').map(n=>n.text())).toEqual(['可继续处理','已过期未完成'])
    expect(view.find('.filter-tabs').text()).toContain('待完成 105')
    await view.findAll('.pagination button').find(n=>n.text()==='下一页')!.trigger('click');await flushPromises()
    expect(requestsOf('getAssignment')).toHaveLength(105)
    expect(view.find('.task-group-heading').text()).toBe('已过期未完成')
    await view.findAll('select')[1]!.setValue('desc');await flushPromises()
    expect(view.findAll('.task-title').slice(0,2).map(n=>n.text())).toEqual(['任务104','任务103'])
    expect(requestsOf('getAssignment')).toHaveLength(105)

  })
  it('全部不可提交时保留未完成数量与独立入口，不生成可处理组',async()=>{
    const items=[summary(ASSIGNMENT,{overdue:true,dueAt:'2026-01-01T00:00:00Z'}),summary(ASSIGNMENT_2)]
    scripted.setHandler(r=>{
      if(r.operationId==='listMyAssignments')return okEnvelope({items,total:2,page:1,pageSize:100})
      if(r.operationId==='getAssignment')return okEnvelope({...items.find(t=>r.path.endsWith(t.id)),canSubmit:false,submissionBlockedReason:'SUBMISSION_CLOSED'})
      return normalResponse(r)
    })
    const view=await open('/student/assignments');await flushPromises()
    expect(view.findAll('.task-group-heading').map(n=>n.text())).toEqual(['已过期未完成','暂不可提交'])
    expect(view.findAll('.task-table-row')).toHaveLength(2)
    expect(view.findAll('.task-table-row a.button').every(n=>n.text()==='查看详情')).toBe(true)
    expect(view.find('.filter-tabs').text()).toContain('待完成 2')
  })
  it('资格读取失败不伪造分组或可操作入口，保留全部待办',async()=>{
    scripted.setHandler(r=>r.operationId==='getAssignment'?failEnvelope(503,'SERVICE_UNAVAILABLE'):normalResponse(r))
    const view=await open('/student/assignments');await flushPromises()
    expect(view.text()).toContain('当前仅按截止时间排序')
    expect(view.findAll('.task-group-heading')).toHaveLength(0)
    expect(view.find('.task-table-row').text()).toContain('查看详情')
    expect(view.find('.filter-tabs').text()).toContain('待完成 1')
  })
  it('课程零计数不重复展示，主要操作按真实章节状态直达且详情仍保留',async()=>{
    scripted.setHandler(r=>r.operationId==='listChapters'?okEnvelope({offeringId:OFFERING,items:[{id:CHAPTER,number:1,title:'章节',publicationState:'published',studentProgress:{status:'completed'}}]}):normalResponse(r))
    dashboardOverride={courses:[course({termId:DEMO_CONFIG.currentTermId,currentChapter:{id:CHAPTER,title:'章节',number:1},progress:{...progress,unit:'chapter',completed:1,total:1,percent:100}})]}
    const view=await open('/course')
    expect(view.find('.course-summary').exists()).toBe(false)
    expect(view.find('.vx-course-primary').text()).toContain('复习章节')
    expect(view.find('.vx-course-primary').attributes('href')).toContain(`/chapter/${CHAPTER}`)
    expect(view.find('.vx-course-copy h2 a').attributes('href')).toBe(`/course/${OFFERING}`)
    expect(view.text()).toContain('李老师')
  })
  it('完整短消息无冗余展开且同一北京时间日期不合并通知',async()=>{
    const contents=['短消息也保留完整阅读入口','第二条相同标题的独立通知']
    scripted.setHandler(r=>r.operationId==='listMessages'?okEnvelope({items:contents.map((content,i)=>({id:`00000000-0000-4000-8000-000000000b0${i}`,offeringId:OFFERING,type:'system',title:'相同标题',content,target:null,sender:null,createdAt:i?'2026-10-13T18:00:00Z':'2026-10-14T02:00:00+08:00',readAt:null})),page:1,pageSize:20,total:2,summary:{unreadCount:2}}):normalResponse(r))
    const view=await open('/student/messages')
    expect(view.findAll('.notification-date')).toHaveLength(1)
    expect(view.findAll('.notification-item')).toHaveLength(2)
    expect(view.findAll('.message-full')).toHaveLength(0)
    expect(view.findAll('.notification-content').map(n=>n.text())).toEqual(contents)
    expect(requestsOf('readMessage')).toHaveLength(0)
  })
  it('消息未读和类型筛选使用正式参数',async()=>{
    const view=await open('/student/messages')
    await view.findAll('.filter-tabs button').find(b=>b.text()==='未读')!.trigger('click');await flushPromises()
    expect(requestsOf('listMessages').at(-1)?.path).toContain('read=unread')
    await view.findAll('.filter-tabs button').find(b=>b.text()==='评价')!.trigger('click');await flushPromises()
    expect(requestsOf('listMessages').at(-1)?.path).toContain('type=feedback')
    expect(requestsOf('listMessages').at(-1)?.path).toContain('read=all')
  })
  it('空 target 的课程公告进入本班公告列表，打开后显式标读', async () => {
    scripted.setHandler(request => request.operationId === 'listMessages'
      ? okEnvelope({ items: [{ id: NOTICE, offeringId: OFFERING, type: 'course_notice', title: '历史公告',
        content: '公告正文', target: null, sender: null, createdAt: '2026-10-14T02:00:00Z', readAt: null }],
        page: 1, pageSize: 20, total: 1, summary: { unreadCount: 1 } })
      : normalResponse(request))
    const page = await open('/student/messages')
    const view = page.findAll('button').find(button => button.text() === '查看公告')
    expect(view).toBeDefined()
    await view!.trigger('click')
    await flushPromises()
    expect(router?.currentRoute.value.fullPath).toBe(`/student/offerings/${OFFERING}/notices`)
    expect(requestsOf('listNotices')).toHaveLength(1)
    expect(requestsOf('readMessage')).toHaveLength(1)
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
  it('8a. 成功时只显示已开放的真实统计', async () => {
    const page = await open(`/teacher/offerings/${OFFERING}`, 'teacher')
    const cards = page.find('.stat-cards')
    expect(cards.text()).toContain('30')
    expect(cards.text()).not.toContain('P2 开放')
    expect(cards.findAll('.stat-card')).toHaveLength(3)
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
    const page = await open('/student/assignments?status=all')
    expect(page.text()).toContain('已归档')
    expect(page.text()).toContain('已截止')
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
