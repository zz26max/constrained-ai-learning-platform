import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import { registerAuthApi, registerAssignmentsApi, registerCoursesApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { AssignmentsApi } from '../src/api/assignments'
import { CoursesApi } from '../src/api/courses'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, failEnvelope, okEnvelope, type ScriptedResponse, type ScriptedTransport, type ScriptHandler } from './helpers'

const OFFERING = '00000000-0000-4000-8000-000000000201'
const ASSIGNMENT = '00000000-0000-4000-8000-000000000701'
const SUBMISSION = '00000000-0000-4000-8000-000000000801'
const FEEDBACK = '00000000-0000-4000-8000-000000000a01'
const MESSAGE_1 = '00000000-0000-4000-8000-000000000b01'
const MESSAGE_2 = '00000000-0000-4000-8000-000000000b02'

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined
let messagesRead: Set<string>

const rubric = [
  { criterionId: 'c1', title: '代码正确性', description: '实现符合需求', maxScore: 50 },
  { criterionId: 'c2', title: '代码质量', description: '结构清晰易读', maxScore: 30 },
]

function message(id: string, type: string, title: string, target: unknown) {
  return {
    id, type, title, content: `${title}内容`, target, createdAt: '2026-10-14T02:00:00Z',
    readAt: messagesRead.has(id) ? '2026-10-14T03:00:00Z' : null,
  }
}

function messagePage() {
  const items = [
    message(MESSAGE_1, 'assignment_published', '新作业发布', { type: 'assignment', id: ASSIGNMENT, offeringId: OFFERING }),
    message(MESSAGE_2, 'course_notice', '周五测验', null),
  ]
  return { items, page: 1, pageSize: 20, total: items.length, summary: { unreadCount: items.filter(item => item.readAt === null).length } }
}

const assignmentDetail = (publishedFeedbackId: string | null) => ({
  id: ASSIGNMENT, offeringId: OFFERING, chapterId: '00000000-0000-4000-8000-000000000301', title: 'HTML 表单实现',
  type: 'web_lab', isRequired: true, publicationState: 'published', description: '完成编程任务',
  dueAt: '2026-11-01T16:00:00Z', assignmentState: publishedFeedbackId ? 'REVIEWED' : 'SUBMITTED', overdue: false,
  latestSubmissionId: SUBMISSION, publishedFeedbackId, unreadFeedback: false,
  requirements: ['实现功能'], estimatedMinutes: 120, maxScore: 80, rubric, knowledgePointIds: [],
  lateUntil: null, allowResubmit: true, maxAttempts: 3, attemptsUsed: 1, canSubmit: false,
  submissionBlockedReason: null, aiPolicyVersion: 1, offeringStatus: 'active',
})

const studentFeedback = {
  id: FEEDBACK, assignmentId: ASSIGNMENT, submissionId: SUBMISSION, status: 'published', version: 2, score: 70,
  comment: '整体完成度不错', rubricResults: [{ criterionId: 'c1', score: 40, comment: '功能正确' }],
  knowledgeEvaluations: [], messageId: MESSAGE_1, publishedAt: '2026-10-14T05:00:00Z',
}

const teacherSubmission = {
  id: SUBMISSION, assignmentId: ASSIGNMENT, offeringId: OFFERING, attemptNumber: 1, workspaceRevision: 1,
  submittedAt: '2026-10-14T04:00:00Z', late: false, superseded: false, feedbackStatus: 'none',
  files: [{ path: 'script.js', content: '// 学生提交代码\n' }], reflection: '完成了表单校验。',
  assignmentSnapshot: { title: 'HTML 表单实现', maxScore: 80, rubric },
  student: { id: DEMO_USER.id, username: 'student.demo', displayName: '演示学生' },
  draftFeedback: null, publishedFeedback: null,
}

const draftResponse = { id: FEEDBACK, submissionId: SUBMISSION, status: 'draft', version: 1, score: 0, comment: '', rubricResults: [], knowledgeEvaluations: [], messageId: null, publishedAt: null }

function normalResponse(request: Parameters<ScriptHandler>[0]): ScriptedResponse {
  switch (request.operationId) {
    case 'listMessages': return okEnvelope(messagePage())
    case 'readMessage': {
      const id = request.path.split('/').filter(Boolean).at(-2) ?? ''
      messagesRead.add(id)
      return okEnvelope(message(id, 'course_notice', '已读', null))
    }
    case 'getAssignment': return okEnvelope(assignmentDetail(FEEDBACK))
    case 'getFeedback': return okEnvelope(studentFeedback)
    case 'getSubmission': return okEnvelope(teacherSubmission)
    case 'saveFeedback': return { status: 201, body: { data: draftResponse, requestId: 'req-save' } }
    default: throw new Error(`未脚本化操作：${request.operationId}`)
  }
}

function requestsOf(operationId: string) {
  return scripted.requests.filter(request => request.operationId === operationId)
}

async function open(path: string, role: 'student' | 'teacher'): Promise<VueWrapper> {
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
  messagesRead = new Set()
  scripted = createScriptedTransport()
  scripted.setHandler(normalResponse)
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
  registerAssignmentsApi(new AssignmentsApi(client))
})

afterEach(() => {
  wrapper?.unmount()
  router?.options.history.destroy()
  wrapper = undefined
  router = undefined
  document.body.innerHTML = ''
})

describe('消息中心 /student/messages', () => {
  it('渲染消息列表与未读数，展示本身不触发已读请求', async () => {
    const page = await open('/student/messages', 'student')
    expect(page.text()).toContain('新作业发布')
    expect(page.text()).toContain('周五测验')
    expect(page.text()).toContain('2 条未读')
    expect(requestsOf('listMessages')[0]?.path).toBe('/api/v1/me/messages?page=1&pageSize=20')
    expect(requestsOf('readMessage')).toHaveLength(0)
  })

  it('点击“标为已读”才发出 readMessage，带 CSRF，并刷新未读数', async () => {
    const page = await open('/student/messages', 'student')
    const button = page.findAll('button').find(item => item.text() === '标为已读')
    if (!button) throw new Error('未找到标为已读按钮')
    await button.trigger('click')
    await flushPromises()
    const reads = requestsOf('readMessage')
    expect(reads).toHaveLength(1)
    expect(reads[0]).toMatchObject({ method: 'PUT', path: `/api/v1/me/messages/${MESSAGE_1}/read` })
    expect(reads[0]?.headers['X-CSRF-Token']).toBe('csrf-student')
    expect(requestsOf('listMessages')).toHaveLength(2)
    expect(page.text()).toContain('1 条未读')
  })

  it('列表为空时显示空状态', async () => {
    scripted.setHandler(request => request.operationId === 'listMessages'
      ? okEnvelope({ items: [], page: 1, pageSize: 20, total: 0, summary: { unreadCount: 0 } })
      : normalResponse(request))
    const page = await open('/student/messages', 'student')
    expect(page.text()).toContain('暂无消息')
    expect(page.find('[role="alert"]').exists()).toBe(false)
  })

  it('请求失败显示错误态而不是空状态', async () => {
    scripted.setHandler(request => request.operationId === 'listMessages'
      ? failEnvelope(500, 'INTERNAL_ERROR', {}, 'req-msg-fail')
      : normalResponse(request))
    const page = await open('/student/messages', 'student')
    expect(page.find('[role="alert"]').exists()).toBe(true)
    expect(page.text()).toContain('req-msg-fail')
    expect(page.text()).not.toContain('暂无消息')
  })

  it('导航栏为学生提供作业与消息入口，教师访问被拒绝', async () => {
    const page = await open('/student/messages', 'student')
    const links = page.findAll('nav a').map(link => link.attributes('href'))
    expect(links).toContain('/student/assignments')
    expect(links).toContain('/student/messages')
    page.unmount()
    wrapper = undefined
    await open('/student/messages', 'teacher')
    expect(router?.currentRoute.value.name).toBe('access-denied')
  })
})

describe('教师批阅 /teacher/submissions/:submissionId/feedback', () => {
  const path = `/teacher/submissions/${SUBMISSION}/feedback`

  it('渲染学生提交与量表，保存草稿发出 saveFeedback（baseVersion、CSRF）', async () => {
    const page = await open(path, 'teacher')
    expect(page.text()).toContain('演示学生')
    expect(page.text()).toContain('// 学生提交代码')
    expect(page.text()).toContain('代码正确性')
    await page.find('form').trigger('submit')
    await flushPromises()
    const saves = requestsOf('saveFeedback')
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({ method: 'POST', path: `/api/v1/teacher/submissions/${SUBMISSION}/feedback` })
    expect(saves[0]?.headers['X-CSRF-Token']).toBe('csrf-teacher')
    const body = JSON.parse(saves[0]?.body ?? '{}')
    expect(body.baseVersion).toBe(0)
    expect(body.rubricResults.map((item: { criterionId: string }) => item.criterionId)).toEqual(['c1', 'c2'])
    expect(page.text()).toContain('反馈草稿已保存')
  })

  it('版本冲突显示错误并提供重新载入', async () => {
    scripted.setHandler(request => request.operationId === 'saveFeedback'
      ? failEnvelope(409, 'FEEDBACK_VERSION_CONFLICT', {}, 'req-conflict')
      : normalResponse(request))
    const page = await open(path, 'teacher')
    await page.find('form').trigger('submit')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(true)
    const reload = page.findAll('button').find(item => item.text() === '重新载入最新版本')
    expect(reload).toBeDefined()
    await reload?.trigger('click')
    await flushPromises()
    expect(requestsOf('getSubmission')).toHaveLength(2)
  })

  it('getSubmission 失败显示错误态，不渲染表单', async () => {
    scripted.setHandler(request => request.operationId === 'getSubmission'
      ? failEnvelope(500, 'INTERNAL_ERROR', {}, 'req-sub-fail')
      : normalResponse(request))
    const page = await open(path, 'teacher')
    expect(page.find('[role="alert"]').exists()).toBe(true)
    expect(page.find('form').exists()).toBe(false)
  })

  it('学生视图的响应（无 student 字段）不能进入批阅', async () => {
    const { student: _student, draftFeedback: _draft, ...studentView } = teacherSubmission
    scripted.setHandler(request => request.operationId === 'getSubmission' ? okEnvelope(studentView) : normalResponse(request))
    const page = await open(path, 'teacher')
    expect(page.find('form').exists()).toBe(false)
    expect(requestsOf('saveFeedback')).toHaveLength(0)
  })

  it('学生访问批阅页被拒绝', async () => {
    await open(path, 'student')
    expect(router?.currentRoute.value.name).toBe('access-denied')
    expect(requestsOf('getSubmission')).toHaveLength(0)
  })
})

describe('作业详情展示已发布反馈（getFeedback）', () => {
  const path = `/student/assignments/${ASSIGNMENT}`

  it('存在 publishedFeedbackId 时请求并展示教师反馈', async () => {
    const page = await open(path, 'student')
    expect(requestsOf('getFeedback')).toHaveLength(1)
    expect(requestsOf('getFeedback')[0]?.path).toBe(`/api/v1/me/feedback/${FEEDBACK}`)
    expect(page.text()).toContain('教师反馈')
    expect(page.text()).toContain('整体完成度不错')
  })

  it('没有 publishedFeedbackId 时不请求反馈', async () => {
    scripted.setHandler(request => request.operationId === 'getAssignment' ? okEnvelope(assignmentDetail(null)) : normalResponse(request))
    const page = await open(path, 'student')
    expect(requestsOf('getFeedback')).toHaveLength(0)
    expect(page.text()).not.toContain('教师反馈')
  })

  it('getFeedback 失败显示错误态，作业内容仍可见', async () => {
    scripted.setHandler(request => request.operationId === 'getFeedback'
      ? failEnvelope(500, 'INTERNAL_ERROR', {}, 'req-fb-fail')
      : normalResponse(request))
    const page = await open(path, 'student')
    expect(page.find('[role="alert"]').exists()).toBe(true)
    expect(page.text()).toContain('req-fb-fail')
    expect(page.text()).toContain('作业要求')
  })
})
