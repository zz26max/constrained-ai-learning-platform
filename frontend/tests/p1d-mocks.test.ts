import { beforeEach, describe, expect, it } from 'vitest'
import {
  mockTransport, resetMockAssignmentState, resetMockAuthState, resetMockCookies,
  resetMockCourseState, resetMockDashboardState, resetMockFeedbackState,
} from '../src/mocks/index'
import { P1A_IDS } from '../src/mocks/courses'
import { P1B_IDS } from '../src/mocks/assignments'
import type { TransportRequest } from '../src/api/transport'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const STUDENT_ID = '00000000-0000-4000-8000-000000000001'

interface Call { status: number; body: any }

let csrf = ''

async function call(operationId: string, method: TransportRequest['method'], path: string, options: { body?: unknown; token?: string | null } = {}): Promise<Call> {
  const headers: Record<string, string> = {}
  const token = options.token === undefined ? csrf : options.token
  if (token) headers['X-CSRF-Token'] = token
  const response = await mockTransport.request({
    operationId, method, path, headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  return { status: response.status, body: JSON.parse(response.bodyText) }
}

async function loginAs(username: string): Promise<void> {
  const pre = await call('getCsrfToken', 'GET', '/api/v1/auth/csrf', { token: null })
  const result = await call('login', 'POST', '/api/v1/auth/login', {
    token: pre.body.data.csrfToken, body: { username, password: 'mock-demo-pass' },
  })
  csrf = result.body.data.csrfToken
}

const validFeedback = (baseVersion: number) => ({
  baseVersion, score: 70, comment: '整体完成度不错',
  rubricResults: [{ criterionId: 'c1', score: 40, comment: '功能正确' }, { criterionId: 'c2', score: 30, comment: '结构清晰' }],
  knowledgeEvaluations: [],
})

// P2 知识评价/标签用例依赖提交快照中的知识点（种子作业 knowledgePointIds 指向知识Web）。
const KNOWLEDGE_WEB = '00000000-0000-4000-8000-000000000501'
const feedbackWithEvaluations = (baseVersion: number) => ({
  ...validFeedback(baseVersion),
  knowledgeEvaluations: [{ knowledgePointId: KNOWLEDGE_WEB, result: 'needs_practice', note: '断点依据需要说明。' }],
  issueTags: ['box_model'],
})

const feedbackPath = `/api/v1/teacher/submissions/${P1B_IDS.submissionWeb1}/feedback`

beforeEach(() => {
  resetMockAuthState()
  resetMockCookies()
  resetMockCourseState()
  resetMockAssignmentState()
  resetMockFeedbackState()
  resetMockDashboardState()
  csrf = ''
})

describe('P1-D mock：会话与权限', () => {
  it('未登录访问返回 401', async () => {
    const result = await call('getDashboard', 'GET', '/api/v1/me/dashboard')
    expect(result.status).toBe(401)
    expect(result.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('学生不能访问教师统计，教师不能访问学生看板', async () => {
    await loginAs('student.demo')
    expect((await call('getOfferingStats', 'GET', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/stats`)).status).toBe(403)
    resetMockAuthState(); resetMockCookies()
    await loginAs('teacher.demo')
    expect((await call('getDashboard', 'GET', '/api/v1/me/dashboard')).status).toBe(403)
  })

  it('写操作缺少 CSRF 令牌返回 403 CSRF_INVALID', async () => {
    await loginAs('student.demo')
    const result = await call('markMessagesAsRead', 'PUT', `/api/v1/me/offerings/${P1A_IDS.offeringWeb}/messages/mark-read`, { body: {}, token: null })
    expect(result.status).toBe(403)
    expect(result.body.error.code).toBe('CSRF_INVALID')
  })
})

describe('P1-D mock：学生侧', () => {
  beforeEach(async () => { await loginAs('student.demo') })

  it('getDashboard 返回契约形状：种子作业已提交故无当前学习项，含未读数与课程摘要', async () => {
    const { status, body } = await call('getDashboard', 'GET', '/api/v1/me/dashboard')
    expect(status).toBe(200)
    expect(body.data.currentLearning).toBeNull()
    expect(body.data.pendingAssignmentCount).toBe(0)
    expect(body.data.unreadMessageCount).toBe(2)
    expect(body.data.courses).toHaveLength(1)
    expect(body.data.recentFeedback).toBeNull()
    expect(body.requestId).toBeTruthy()
  })

  it('listMessages：分页字段为 total，summary.unreadCount，按时间倒序', async () => {
    const { body } = await call('listMessages', 'GET', '/api/v1/me/messages?page=1&pageSize=20')
    expect(body.data).toMatchObject({ page: 1, pageSize: 20, total: 2, summary: { unreadCount: 2 } })
    expect(body.data.items.map((item: { type: string }) => item.type)).toEqual(['course_notice', 'assignment_published'])
    expect(body.data.items.every((item: { readAt: unknown }) => item.readAt === null)).toBe(true)
  })

  it('listMessages：非法分页参数返回 422', async () => {
    expect((await call('listMessages', 'GET', '/api/v1/me/messages?pageSize=1000')).status).toBe(422)
  })

  it('readMessage：保留首次阅读时间，未读数递减', async () => {
    const list = await call('listMessages', 'GET', '/api/v1/me/messages')
    const id = list.body.data.items[0].id
    const first = await call('readMessage', 'PUT', `/api/v1/me/messages/${id}/read`, { body: {} })
    const second = await call('readMessage', 'PUT', `/api/v1/me/messages/${id}/read`, { body: {} })
    expect(first.status).toBe(200)
    expect(second.body.data.readAt).toBe(first.body.data.readAt)
    const after = await call('listMessages', 'GET', '/api/v1/me/messages?read=unread')
    expect(after.body.data.summary.unreadCount).toBe(1)
    expect(after.body.data.total).toBe(1)
  })

  it('readMessage：他人或不存在的消息返回 404', async () => {
    const result = await call('readMessage', 'PUT', '/api/v1/me/messages/00000000-0000-4000-8000-0000000000ff/read', { body: {} })
    expect(result.status).toBe(404)
  })

  it('markMessagesAsRead：返回 markedAt，type 过滤只标记匹配类型', async () => {
    const path = `/api/v1/me/offerings/${P1A_IDS.offeringWeb}/messages/mark-read`
    const filtered = await call('markMessagesAsRead', 'PUT', `${path}?type=feedback`, { body: {} })
    expect(filtered.body.data.markedAt).toBeTruthy()
    expect((await call('listMessages', 'GET', '/api/v1/me/messages')).body.data.summary.unreadCount).toBe(2)
    await call('markMessagesAsRead', 'PUT', path, { body: {} })
    expect((await call('listMessages', 'GET', '/api/v1/me/messages')).body.data.summary.unreadCount).toBe(0)
  })

  it('markMessagesAsRead：请求体必须是空对象', async () => {
    const result = await call('markMessagesAsRead', 'PUT', `/api/v1/me/offerings/${P1A_IDS.offeringWeb}/messages/mark-read`, { body: { x: 1 } })
    expect(result.status).toBe(422)
  })

  it('getMyLearningRecords：默认分页，结构含 feedbackPage 与 knowledgeEvidence', async () => {
    const { status, body } = await call('getMyLearningRecords', 'GET', `/api/v1/me/offerings/${P1A_IDS.offeringWeb}/learning-records`)
    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      offeringId: P1A_IDS.offeringWeb, recentFeedback: null, knowledgeEvidence: [], nextRecommendation: null,
      summary: { completedLabCount: 0, publishedFeedbackCount: 0 },
      feedbackPage: { items: [], page: 1, pageSize: 20, total: 0 },
    })
  })

  it('getMyLearningRecords：非本班返回 404', async () => {
    const result = await call('getMyLearningRecords', 'GET', `/api/v1/me/offerings/${P1A_IDS.offeringForeign}/learning-records`)
    expect(result.status).toBe(404)
  })

  it('listNotices / getNotice：分页与详情含 target 与 recipientCount', async () => {
    const list = await call('listNotices', 'GET', `/api/v1/offerings/${P1A_IDS.offeringWeb}/notices`)
    expect(list.body.data).toMatchObject({ page: 1, pageSize: 20, total: 1 })
    const notice = list.body.data.items[0]
    expect(notice).toMatchObject({ target: null, recipientCount: 1 })
    const detail = await call('getNotice', 'GET', `/api/v1/notices/${notice.id}`)
    expect(detail.body.data.id).toBe(notice.id)
    expect((await call('getNotice', 'GET', '/api/v1/notices/00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
  })

  it('getSubmission：学生视图只含已发布评价，无 student/draftFeedback', async () => {
    const { status, body } = await call('getSubmission', 'GET', `/api/v1/submissions/${P1B_IDS.submissionWeb1}`)
    expect(status).toBe(200)
    expect(body.data.publishedFeedback).toBeNull()
    expect('draftFeedback' in body.data).toBe(false)
    expect('student' in body.data).toBe(false)
  })

  it('getFeedback：草稿或不存在的评价返回 404', async () => {
    expect((await call('getFeedback', 'GET', '/api/v1/me/feedback/00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
  })
})

describe('P1-D mock：教师批阅链路', () => {
  beforeEach(async () => { await loginAs('teacher.demo') })

  it('getSubmission：教师视图含 student 与 draftFeedback', async () => {
    const { body } = await call('getSubmission', 'GET', `/api/v1/submissions/${P1B_IDS.submissionWeb1}`)
    expect(body.data.student.username).toBe('student.demo')
    expect(body.data.draftFeedback).toBeNull()
    expect(body.data.assignmentSnapshot.rubric).toHaveLength(2)
  })

  it('saveFeedback：首次 201，更新 200 且 version 递增，旧 baseVersion 409', async () => {
    const created = await call('saveFeedback', 'POST', feedbackPath, { body: validFeedback(0) })
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ status: 'draft', version: 1, messageId: null, publishedAt: null })
    const updated = await call('saveFeedback', 'POST', feedbackPath, { body: validFeedback(1) })
    expect(updated.status).toBe(200)
    expect(updated.body.data.version).toBe(2)
    const stale = await call('saveFeedback', 'POST', feedbackPath, { body: validFeedback(1) })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('FEEDBACK_VERSION_CONFLICT')
  })

  it('saveFeedback：分数超过满分返回 422', async () => {
    const result = await call('saveFeedback', 'POST', feedbackPath, { body: { ...validFeedback(0), score: 999 } })
    expect(result.status).toBe(422)
  })

  it('saveFeedback：P2 知识评价与词表标签随草稿保存，issueTagVersion 记录词表版本', async () => {
    const saved = await call('saveFeedback', 'POST', feedbackPath, { body: feedbackWithEvaluations(0) })
    expect(saved.status).toBe(201)
    expect(saved.body.data.knowledgeEvaluations).toEqual([
      { knowledgePointId: KNOWLEDGE_WEB, result: 'needs_practice', note: '断点依据需要说明。' },
    ])
    expect(saved.body.data.issueTags).toEqual(['box_model'])
    expect(saved.body.data.issueTagVersion).toBe(1)

    // 提交快照现在带知识点定义，教师视图可见
    const detail = await call('getSubmission', 'GET', `/api/v1/submissions/${P1B_IDS.submissionWeb1}`)
    expect(detail.body.data.assignmentSnapshot.knowledgePoints).toEqual([
      { id: KNOWLEDGE_WEB, title: 'HTML 语义结构', description: '解释标签与内容结构的关系。' },
    ])
  })

  it('saveFeedback：知识点越权、重复与词表外标签、重复标签分别 422', async () => {
    const foreign = await call('saveFeedback', 'POST', feedbackPath, {
      body: { ...feedbackWithEvaluations(0), knowledgeEvaluations: [{ knowledgePointId: '00000000-0000-4000-8000-000000000999', result: 'needs_practice', note: 'x' }] },
    })
    expect(foreign.status).toBe(422)
    const duplicated = await call('saveFeedback', 'POST', feedbackPath, {
      body: { ...feedbackWithEvaluations(0), knowledgeEvaluations: [
        { knowledgePointId: KNOWLEDGE_WEB, result: 'needs_practice', note: 'a' },
        { knowledgePointId: KNOWLEDGE_WEB, result: 'meets_expectation', note: 'b' },
      ] },
    })
    expect(duplicated.status).toBe(422)
    const badTag = await call('saveFeedback', 'POST', feedbackPath, {
      body: { ...feedbackWithEvaluations(0), issueTags: ['made_up_tag'] },
    })
    expect(badTag.status).toBe(422)
    const duplicateTag = await call('saveFeedback', 'POST', feedbackPath, {
      body: { ...feedbackWithEvaluations(0), issueTags: ['box_model', 'box_model'] },
    })
    expect(duplicateTag.status).toBe(422)
  })

  it('saveFeedback：非法 result 枚举返回 422', async () => {
    const result = await call('saveFeedback', 'POST', feedbackPath, {
      body: { ...feedbackWithEvaluations(0), knowledgeEvaluations: [{ knowledgePointId: KNOWLEDGE_WEB, result: 'excellent', note: '' }] },
    })
    expect(result.status).toBe(422)
  })

  it('publishFeedback：学生转 REVIEWED、产生消息，学生可读取已发布评价', async () => {
    const draft = await call('saveFeedback', 'POST', feedbackPath, { body: validFeedback(0) })
    const stale = await call('publishFeedback', 'POST', `${feedbackPath}/publish`, { body: { baseVersion: 0 } })
    expect(stale.body.error.code).toBe('FEEDBACK_VERSION_CONFLICT')
    const published = await call('publishFeedback', 'POST', `${feedbackPath}/publish`, { body: { baseVersion: draft.body.data.version } })
    expect(published.status).toBe(200)
    expect(published.body.data).toMatchObject({ status: 'published', version: 2, messageId: null })
    expect(published.body.data.publishedAt).toBeTruthy()
    // 契约 1.1.1（x-idempotency: natural）：发布后以发布前版本或当前版本重放均幂等返回
    // 200 原视图，不重复加版本、不发通知；其余版本 409 FEEDBACK_VERSION_CONFLICT。
    const replayPrePublish = await call('publishFeedback', 'POST', `${feedbackPath}/publish`, { body: { baseVersion: 1 } })
    expect(replayPrePublish.status).toBe(200)
    expect(replayPrePublish.body.data).toMatchObject({ status: 'published', version: 2 })
    const replayCurrent = await call('publishFeedback', 'POST', `${feedbackPath}/publish`, { body: { baseVersion: 2 } })
    expect(replayCurrent.status).toBe(200)
    expect(replayCurrent.body.data).toMatchObject({ status: 'published', version: 2 })
    const wrongVersion = await call('publishFeedback', 'POST', `${feedbackPath}/publish`, { body: { baseVersion: 5 } })
    expect(wrongVersion.status).toBe(409)
    expect(wrongVersion.body.error.code).toBe('FEEDBACK_VERSION_CONFLICT')

    resetMockAuthState(); resetMockCookies()
    await loginAs('student.demo')
    const view = await call('getFeedback', 'GET', `/api/v1/me/feedback/${published.body.data.id}`)
    expect(view.status).toBe(200)
    expect(view.body.data.messageId).toMatch(UUID_PATTERN)
    expect('draftFeedback' in view.body.data).toBe(false)
    const assignments = await call('listMyAssignments', 'GET', '/api/v1/me/assignments')
    expect(assignments.body.data.items[0]).toMatchObject({ assignmentState: 'REVIEWED', publishedFeedbackId: published.body.data.id })
    const messages = await call('listMessages', 'GET', '/api/v1/me/messages?type=feedback')
    expect(messages.body.data.total).toBe(1)
    expect(messages.body.data.items[0].target).toMatchObject({ type: 'feedback', id: published.body.data.id })
    const dashboard = await call('getDashboard', 'GET', '/api/v1/me/dashboard')
    expect(dashboard.body.data.recentFeedback.id).toBe(published.body.data.id)
  })

  it('createNotice：201 返回 NoticeDTO，学生随后可在列表和消息中看到', async () => {
    const created = await call('createNotice', 'POST', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/notices`, {
      body: { title: '周五测验', content: '请准备', target: null },
    })
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ title: '周五测验', target: null, recipientCount: 1 })
    expect(await call('createNotice', 'POST', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/notices`, { body: { title: '', content: 'x' } })).toMatchObject({ status: 422 })
    const rejected = await call('createNotice', 'POST', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/notices`, { body: { title: 't', content: 'c', targetStudentId: STUDENT_ID } })
    expect(rejected.status).toBe(422)

    resetMockAuthState(); resetMockCookies()
    await loginAs('student.demo')
    const list = await call('listNotices', 'GET', `/api/v1/offerings/${P1A_IDS.offeringWeb}/notices`)
    expect(list.body.data.total).toBe(2)
    expect(list.body.data.items[0].title).toBe('周五测验')
  })

  it('统计：getOfferingStats / getAssignmentStats / getStudentLearningRecords', async () => {
    const offering = await call('getOfferingStats', 'GET', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/stats`)
    expect(offering.body.data).toEqual({ studentCount: 1, activeAssignmentCount: 1, pendingReviewCount: 1, pendingHelpCount: 0 })
    const assignment = await call('getAssignmentStats', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/stats`)
    expect(assignment.body.data).toEqual({ studentCount: 1, submittedStudentCount: 1, pendingReviewCount: 1, reviewedStudentCount: 0, commonIssues: [] })
    const records = await call('getStudentLearningRecords', 'GET', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/students/${STUDENT_ID}/learning-records?page=1&pageSize=10`)
    expect(records.body.data.student).toMatchObject({ id: STUDENT_ID, username: 'student.demo' })
    expect(records.body.data.feedbackPage).toMatchObject({ page: 1, pageSize: 10, total: 0 })
    const unknown = await call('getStudentLearningRecords', 'GET', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/students/${P1A_IDS.chapterWeb}/learning-records`)
    expect(unknown.status).toBe(404)
  })
})
