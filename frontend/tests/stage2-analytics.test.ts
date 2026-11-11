import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import TeacherAnalyticsPage from '../src/features/teacher/TeacherAnalyticsPage.vue'
import TeacherStudentProgressPage from '../src/features/teacher/TeacherStudentProgressPage.vue'
import AssignmentCommonIssues from '../src/features/assignments/AssignmentCommonIssues.vue'
import StudentRecords from '../src/features/student/visual/StudentRecords.vue'
import { registerAssignmentsApi, registerAuthApi, registerCoursesApi, registerDashboardApi, registerStatsApi } from '../src/api'
import { AssignmentsApi } from '../src/api/assignments'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { CoursesApi } from '../src/api/courses'
import { DashboardApi } from '../src/api/dashboard'
import { StatsApi } from '../src/api/stats'
import type { OfferingActivityDTO, OfferingKnowledgeMasteryDTO } from '../src/api/stats'
import { useAuthStore } from '../src/stores/auth'
import {
  DEMO_CONFIG, DEMO_USER, createScriptedTransport, failEnvelope, okEnvelope,
  type ScriptHandler, type ScriptedTransport,
} from './helpers'

vi.mock('../src/features/teacher/analytics/echarts', () => ({
  echarts: {
    init: () => ({ setOption: () => undefined, resize: () => undefined, dispose: () => undefined }),
  },
}))

const OFFERING = '00000000-0000-4000-8000-000000000201'
const CHAPTER = '00000000-0000-4000-8000-000000000301'
const RESOURCE = '00000000-0000-4000-8000-000000000401'
const KNOWLEDGE = '00000000-0000-4000-8000-000000000501'
const ASSIGNMENT = '00000000-0000-4000-8000-000000000701'
const STUDENT = '00000000-0000-4000-8000-000000000001'

const zeroDistribution = { basicallyMastered: 0, needsPractice: 0, learning: 0, insufficientEvidence: 0 }

function activityFixture(overrides: Partial<OfferingActivityDTO['totals']> = {}, empty = false): OfferingActivityDTO {
  const dates = Array.from({ length: 14 }, (_, index) => `2026-10-${String(18 + index).padStart(2, '0')}`)
  const day = (date: string, active: boolean) => ({
    date,
    activeStudentCount: active && !empty ? 2 : 0,
    chapterOpenedCount: active && !empty ? 3 : 0,
    resourceOpenedCount: 0,
    editorOpenedCount: active && !empty ? 2 : 0,
    previewOpenedCount: 0,
    workspaceSavedCount: active && !empty ? 2 : 0,
    assignmentSubmittedCount: active && !empty ? 1 : 0,
    helpRequestCreatedCount: 0,
    tutoringCompletedCount: active && !empty ? 1 : 0,
  })
  const days = dates.map((date, index) => day(date, index === 13))
  const totals = {
    activeStudentCount: empty ? 0 : 2, chapterOpenedCount: empty ? 0 : 3, resourceOpenedCount: 0,
    editorOpenedCount: empty ? 0 : 2, previewOpenedCount: 0, workspaceSavedCount: empty ? 0 : 2,
    assignmentSubmittedCount: empty ? 0 : 1, helpRequestCreatedCount: 0, tutoringCompletedCount: empty ? 0 : 1,
    ...overrides,
  }
  return { offeringId: OFFERING, from: dates[0]!, to: dates[13]!, days, totals }
}

function masteryFixture(overrides: Partial<OfferingKnowledgeMasteryDTO> = {}): OfferingKnowledgeMasteryDTO {
  const distribution = { basicallyMastered: 1, needsPractice: 1, learning: 1, insufficientEvidence: 1 }
  return {
    offeringId: OFFERING, ruleVersion: 'knowledge-v2', asOf: '2026-10-31T02:00:00Z',
    studentCount: 4, assessedStudentCount: 2, knowledgePointCount: 1,
    summary: { assessmentCount: 4, distribution, masteryRate: 0.25 },
    items: [{
      knowledgePointId: KNOWLEDGE, title: 'HTML 语义结构', chapterId: CHAPTER,
      studentCount: 4, assessedStudentCount: 2, distribution, masteryRate: 0.25,
    }],
    ...overrides,
  }
}

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined

function analyticsRouter(): Router {
  const stub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'teacher-analytics', path: '/teacher/offerings/:id/analytics', component: TeacherAnalyticsPage },
      { name: 'teacher-offering', path: '/teacher/offerings/:id', component: stub },
      { name: 'teacher-assignments', path: '/teacher/offerings/:offeringId/assignments', component: stub },
      { name: 'teacher-assignment', path: '/teacher/assignments/:id', component: stub },
      { name: 'teacher-student-progress', path: '/teacher/offerings/:offeringId/students/:studentId/progress', component: TeacherStudentProgressPage },
      { name: 'student-progress', path: '/student/progress/:offeringId', component: StudentRecords },
      { name: 'student-progress-select', path: '/student/progress', component: StudentRecords },
      { name: 'student-assignment', path: '/student/assignments/:id', component: stub },
      { name: 'student-assignments', path: '/student/assignments', component: stub },
      { name: 'student-workspace', path: '/student/workspaces/:id', component: stub },
      { name: 'chapter', path: '/course/:offeringId/chapter/:chapterId', component: stub },
      { name: 'courses', path: '/course', component: stub },
    ],
  })
}

function auth(role: 'student' | 'teacher', serverChecks = false): void {
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: `csrf-${role}`,
    identity: { ...DEMO_USER, roles: [role] }, config: { ...DEMO_CONFIG, terms: [], features: { ...DEMO_CONFIG.features, serverChecks } },
  })
}

async function open(path: string, role: 'student' | 'teacher', serverChecks = false): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  auth(role, serverChecks)
  router = analyticsRouter()
  await router.push(path)
  await router.isReady()
  return mount(router.currentRoute.value.matched[0]!.components!.default as never, {
    global: { plugins: [pinia, router] },
  })
}

beforeEach(() => {
  scripted = createScriptedTransport()
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
  registerAssignmentsApi(new AssignmentsApi(client))
  registerDashboardApi(new DashboardApi(client))
  registerStatsApi(new StatsApi(client))
})

afterEach(() => {
  wrapper?.unmount()
  router?.options.history.destroy()
  vi.restoreAllMocks()
})

describe('教师学习分析', () => {
  it('活动与掌握分布按契约渲染，图表带文字摘要和无障碍标签', async () => {
    scripted.setHandler(request => request.operationId === 'getOfferingActivity'
      ? okEnvelope(activityFixture())
      : okEnvelope(masteryFixture()))
    wrapper = await open(`/teacher/offerings/${OFFERING}/analytics`, 'teacher')
    await flushPromises()

    const operationIds = scripted.requests.map(request => request.operationId)
    expect(operationIds).toContain('getOfferingActivity')
    expect(operationIds).toContain('getOfferingKnowledgeMastery')
    expect(scripted.requests.find(request => request.operationId === 'getOfferingActivity')?.path)
      .toBe(`/api/v1/teacher/offerings/${OFFERING}/activity`)

    expect(wrapper.text()).toContain('14 天共 2 名学生活跃，产生 9 次学习事件；章节打开最多（3 次）。')
    expect(wrapper.text()).toContain('共 4 个学生与知识点组合：基本掌握 1，学习中 1，需要练习 1，证据不足 1；基本掌握率 25%。')
    expect(wrapper.text()).toContain('HTML 语义结构')

    const charts = wrapper.findAll('.ui-chart')
    expect(charts).toHaveLength(2)
    expect(charts[0]!.attributes('role')).toBe('img')
    expect(charts[0]!.attributes('aria-label')).toContain('最近 14 天学习活跃度图表')
    expect(charts[1]!.attributes('aria-label')).toContain('知识点掌握分布图表')
  })

  it('没有学习行为时显示趋势空状态，没有证据时显示掌握空状态', async () => {
    const masteryEmpty = masteryFixture({
      studentCount: 2, assessedStudentCount: 0, knowledgePointCount: 1,
      summary: { assessmentCount: 2, distribution: { ...zeroDistribution, insufficientEvidence: 2 }, masteryRate: 0 },
      items: [{
        knowledgePointId: KNOWLEDGE, title: 'HTML 语义结构', chapterId: CHAPTER,
        studentCount: 2, assessedStudentCount: 0,
        distribution: { ...zeroDistribution, insufficientEvidence: 2 }, masteryRate: 0,
      }],
    })
    scripted.setHandler(request => request.operationId === 'getOfferingActivity'
      ? okEnvelope(activityFixture({}, true))
      : okEnvelope(masteryEmpty))
    wrapper = await open(`/teacher/offerings/${OFFERING}/analytics`, 'teacher')
    await flushPromises()

    expect(wrapper.text()).toContain('最近 14 天还没有学习行为')
    expect(wrapper.text()).toContain('还没有知识点证据')
    expect(wrapper.findAll('.ui-chart')).toHaveLength(0)
  })

  it('两个请求互不影响，错误可单独重试', async () => {
    let failActivity = true
    const handler: ScriptHandler = request => {
      if (request.operationId === 'getOfferingActivity') {
        return failActivity ? failEnvelope(500, 'INTERNAL_ERROR', {}, 'req-activity') : okEnvelope(activityFixture())
      }
      return okEnvelope(masteryFixture())
    }
    scripted.setHandler(handler)
    wrapper = await open(`/teacher/offerings/${OFFERING}/analytics`, 'teacher')
    await flushPromises()

    expect(wrapper.text()).toContain('暂时无法完成请求')
    expect(wrapper.text()).toContain('基本掌握率')
    failActivity = false
    const retry = wrapper.findAll('button').find(button => button.text() === '重新加载')
    expect(retry).toBeDefined()
    await retry!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('14 天共 2 名学生活跃')
    expect(scripted.requests.filter(request => request.operationId === 'getOfferingActivity')).toHaveLength(2)
  })
})

describe('作业常见问题', () => {
  it('首次展开才请求统计，并解释问题标签与知识点的共现关系', async () => {
    scripted.setHandler(() => okEnvelope({
      studentCount: 1, submittedStudentCount: 1, pendingReviewCount: 0, reviewedStudentCount: 1,
      commonIssues: [{
        issueTag: 'layout_overflow', title: '布局溢出', reportedStudentCount: 0, confirmedStudentCount: 1,
        distinctStudentCount: 1, description: '容器在窄屏或内容变化时溢出', sources: ['teacher_feedback'],
        timeRange: { from: '2026-10-20T02:00:00Z', to: '2026-10-21T02:00:00Z' },
        knowledgePointId: KNOWLEDGE, knowledgePointTitle: '盒模型',
      }],
    }))
    const pinia = createPinia()
    setActivePinia(pinia)
    auth('teacher')
    wrapper = mount(AssignmentCommonIssues, {
      props: { assignmentId: ASSIGNMENT }, global: { plugins: [pinia] },
    })
    expect(scripted.requests).toHaveLength(0)

    const details = wrapper.get('details')
    ;(details.element as HTMLDetailsElement).open = true
    await details.trigger('toggle')
    await flushPromises()

    expect(scripted.requests).toHaveLength(1)
    expect(wrapper.text()).toContain('布局溢出')
    expect(wrapper.text()).toContain('教师确认')
    expect(wrapper.text()).toContain('学生自报 0 · 教师确认 1 · 涉及 1 名学生')
    expect(wrapper.get('.assignment-issue-kp').text()).toContain('知识点「盒模型」与该标签曾出现在同一份评价中')
  })

  it('没有常见问题时显示空说明', async () => {
    scripted.setHandler(() => okEnvelope({
      studentCount: 1, submittedStudentCount: 1, pendingReviewCount: 1, reviewedStudentCount: 0, commonIssues: [],
    }))
    const pinia = createPinia()
    setActivePinia(pinia)
    auth('teacher')
    wrapper = mount(AssignmentCommonIssues, {
      props: { assignmentId: ASSIGNMENT }, global: { plugins: [pinia] },
    })
    const details = wrapper.get('details')
    ;(details.element as HTMLDetailsElement).open = true
    await details.trigger('toggle')
    await flushPromises()
    expect(wrapper.text()).toContain('暂未汇总常见问题')
  })
})

describe('教师查看学生的下一步建议', () => {
  it.each([
    { type: 'assignment', id: ASSIGNMENT, label: '查看作业', href: `/teacher/assignments/${ASSIGNMENT}` },
    { type: 'resource', id: RESOURCE, label: '查看班级资料', href: `/teacher/offerings/${OFFERING}` },
    { type: 'offering', id: OFFERING, label: '查看教学班', href: `/teacher/offerings/${OFFERING}` },
  ])('建议目标 $type 可从教师页面打开', async ({ type, id, label, href }) => {
    scripted.setHandler(() => okEnvelope({
      offeringId: OFFERING,
      summary: { completedLabCount: 0, publishedFeedbackCount: 0, needsPracticeCount: 1 },
      recentFeedback: null,
      feedbackPage: { items: [], page: 1, pageSize: 10, total: 0 },
      knowledgeEvidence: [],
      student: { id: STUDENT, displayName: '同学' },
      nextRecommendation: {
        knowledgePointId: KNOWLEDGE, title: '盒模型', reason: '复习关联内容。', sourceFeedbackId: null,
        evidenceIds: [], target: { type, id, offeringId: OFFERING },
      },
    }))
    wrapper = await open(`/teacher/offerings/${OFFERING}/students/${STUDENT}/progress`, 'teacher')
    await flushPromises()

    const link = wrapper.get('[aria-labelledby="progress-reco-title"] a')
    expect(link.text()).toBe(label)
    expect(link.attributes('href')).toBe(href)
    await link.trigger('click')
    await flushPromises()
    expect(router?.currentRoute.value.path).toBe(href)
  })
})

describe('学生知识点掌握概览', () => {
  it('个人学习展示当前版本的自测并优先推荐同章节的后续题', async () => {
    const first = '00000000-0000-4000-8000-000000000610'
    const other = '00000000-0000-4000-8000-000000000611'
    const transfer = '00000000-0000-4000-8000-000000000612'
    const html = '00000000-0000-4000-8000-000000000310'
    const sql = '00000000-0000-4000-8000-000000000314'
    const tasks = [
      { id: first, title: '基础练习', chapterId: html, type: 'web_lab' },
      { id: other, title: 'SQL 练习', chapterId: sql, type: 'sql_text' },
      { id: transfer, title: '迁移练习', chapterId: html, type: 'web_lab' },
    ].map(task => ({ ...task, offeringId: OFFERING, publicationState: 'published', description: '' }))
    let checkingTransfer = true
    scripted.setHandler(request => {
      switch (request.operationId) {
        case 'listMyCourses': return okEnvelope({ items: [{ offeringId: OFFERING, title: '个人课程', status: 'active', teachers: [], progress: { unit: 'chapter', completed: 1, total: 2 } }], page: 1, pageSize: 100, total: 1 })
        case 'listMyAssignments': return okEnvelope({ items: tasks, page: 1, pageSize: 100, total: 3 })
        case 'getWorkspace': return okEnvelope({ revision: request.path.includes(first) ? 2 : 0 })
        case 'getAssignmentCheck': return okEnvelope({ configured: true, check: request.path.includes(first) ? { status: 'completed', result: { total: 2, passed: 2 } } : request.path.includes(transfer) && checkingTransfer ? { status: 'running', result: null } : null })
        default: return okEnvelope({ offeringId: OFFERING, summary: { completedLabCount: 0, publishedFeedbackCount: 0, needsPracticeCount: null }, recentFeedback: null, feedbackPage: { items: [], total: 0 }, knowledgeEvidence: [], nextRecommendation: null })
      }
    })
    wrapper = await open(`/student/progress/${OFFERING}`, 'student', true)
    await flushPromises()
    const section = wrapper.get('[aria-labelledby="practice-title"]')
    expect(section.text()).toContain('1 / 3 项已通过')
    expect(section.get('.reco h3').text()).toBe('SQL 练习')
    checkingTransfer = false
    await section.get('button').trigger('click')
    await flushPromises()
    expect(section.get('.reco h3').text()).toBe('迁移练习')
    expect(section.get('.reco a').attributes('href')).toContain(transfer)
    expect(scripted.requests.find(request => request.operationId === 'getAssignmentCheck' && request.path.includes(first))?.path).toContain('workspaceRevision=2')
  })

  it.each(['chapter', 'assignment'] as const)('按四种状态计数并正确展示 %s 进度单位', async unit => {
    const course = {
      offeringId: OFFERING, courseId: '00000000-0000-4000-8000-000000000101', title: 'Web 前端开发技术',
      mark: 'WEB', groupName: '计算机 2301 班', termId: null,
      termLabel: '2026 秋季学期', status: 'active',
      teachers: [{ id: DEMO_USER.id, displayName: '李老师' }],
      currentChapter: null, progress: { unit, completed: 1, total: 2, percent: 50, notConfigured: false, asOf: '2026-10-14T02:00:00Z' },
      lastStudiedAt: null, pendingAssignmentCount: 0, unreadFeedbackCount: 0,
    }
    const assessment = (id: string, title: string, state: string) => ({
      knowledgePointId: id, title, assessmentState: state, ruleVersion: 'knowledge-v2', asOf: '2026-10-31T02:00:00Z',
      latestEvidenceAt: null, evidenceCount: 0, freshness: 'none', evidenceIds: [], explanation: '', evidence: [],
    })
    scripted.setHandler(request => {
      if (request.operationId === 'listMyCourses') return okEnvelope({ items: [course], page: 1, pageSize: 100, total: 1 })
      return okEnvelope({
        offeringId: OFFERING,
        summary: { completedLabCount: 0, publishedFeedbackCount: 0, needsPracticeCount: null },
        recentFeedback: null,
        feedbackPage: { items: [], page: 1, pageSize: 10, total: 0 },
        knowledgeEvidence: [
          assessment('00000000-0000-4000-8000-000000000511', '基本点', 'basically_mastered'),
          assessment('00000000-0000-4000-8000-000000000512', '学习点', 'learning'),
          assessment('00000000-0000-4000-8000-000000000513', '练习点', 'needs_practice'),
          assessment('00000000-0000-4000-8000-000000000514', '证据点', 'insufficient_evidence'),
        ],
        nextRecommendation: null,
      })
    })
    wrapper = await open(`/student/progress/${OFFERING}`, 'student')
    await flushPromises()

    expect(wrapper.get('.mastery-overview').attributes('aria-label')).toBe('知识点掌握概览')
    const legend = wrapper.get('.mastery-legend').text()
    expect(legend).toContain('基本掌握1')
    expect(legend).toContain('学习中1')
    expect(legend).toContain('需要练习1')
    expect(legend).toContain('证据不足1')
    expect(wrapper.findAll('.mastery-bar span')).toHaveLength(4)
    expect(wrapper.findAll('.mastery-legend i').map(swatch => swatch.attributes('data-state')))
      .toEqual(['basically_mastered', 'learning', 'needs_practice', 'insufficient_evidence'])
    expect(wrapper.text()).toContain('评价信息不足，不代表尚未掌握')
    expect(wrapper.get('.stats dt').text()).toBe(unit === 'assignment' ? '作业进度' : '章节进度')
  })
})
