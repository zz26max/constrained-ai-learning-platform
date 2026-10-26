import { beforeEach, describe, expect, it } from 'vitest'
import {
  mockTransport, resetMockAssignmentState, resetMockAnalyticsState, resetMockAuthState, resetMockCookies,
  resetMockCourseState, resetMockDashboardState, resetMockFeedbackState, resetMockTutoringState,
} from '../src/mocks/index'
import { P1A_IDS } from '../src/mocks/courses'
import { mockAssignmentStore, P1B_IDS } from '../src/mocks/assignments'
import type { TeacherAssignmentDTO } from '../src/api/assignments'
import type { TransportRequest } from '../src/api/transport'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

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
  // mock 的 getCsrfToken 在已有会话时返回会话令牌，切换账号前必须重置会话与 Cookie。
  resetMockAuthState()
  resetMockCookies()
  const pre = await call('getCsrfToken', 'GET', '/api/v1/auth/csrf', { token: null })
  const result = await call('login', 'POST', '/api/v1/auth/login', {
    token: pre.body.data.csrfToken, body: { username, password: 'mock-demo-pass' },
  })
  csrf = result.body.data.csrfToken
}

beforeEach(() => {
  resetMockAuthState()
  resetMockCookies()
  resetMockCourseState()
  resetMockAssignmentState()
  resetMockFeedbackState()
  resetMockDashboardState()
  resetMockTutoringState()
  resetMockAnalyticsState()
  csrf = ''
})

const assignmentPath = `/api/v1/assignments/${P1B_IDS.assignmentWeb}`

describe('F2 mock 契约对齐：submitAssignment 自然幂等', () => {
  it('首次提交 201；同 revision 重放 200 返回原提交，不占次数、reflection 不覆盖原值', async () => {
    await loginAs('student.demo')
    // 种子夹具已有一次提交（revision 1），本次提交 revision 2 为第 2 次尝试。
    const first = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 2, reflection: '原始反思。' } })
    expect(first.status).toBe(201)
    expect(first.body.data.attemptNumber).toBe(2)

    const replay = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 2, reflection: '试图覆盖的反思。' } })
    expect(replay.status).toBe(200)
    expect(replay.body.data.id).toBe(first.body.data.id)
    expect(replay.body.data.attemptNumber).toBe(2)

    const detail = await call('getSubmission', 'GET', `/api/v1/submissions/${first.body.data.id}`)
    expect(detail.body.data.reflection).toBe('原始反思。')
  })

  it('保存新 revision 后重放旧 revision 仍幂等返回原提交（幂等先于冲突）', async () => {
    await loginAs('student.demo')
    const first = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 2, reflection: '第一次。' } })
    expect(first.status).toBe(201)
    const saved = await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
      body: { baseRevision: 2, activeFile: 'script.js', files: [{ path: 'script.js', content: '// 新版本' }] },
    })
    expect(saved.status).toBe(200)
    const replayOld = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 2, reflection: '重放。' } })
    expect(replayOld.status).toBe(200)
    expect(replayOld.body.data.id).toBe(first.body.data.id)
  })

  it('归档班同 revision 重放返回原提交，新建提交被 OFFERING_ARCHIVED 阻断', async () => {
    await loginAs('student.demo')
    // 直接种子一份"已提交后班级才归档"的数据：mock 的 createAssignment 会拒绝归档班新作业。
    const assignmentId = '00000000-0000-4000-8000-00000000ea01'
    const submissionId = '00000000-0000-4000-8000-00000000eb01'
    const dto: TeacherAssignmentDTO = {
      id: assignmentId, offeringId: P1A_IDS.offeringPendingArchive, chapterId: null,
      title: '归档班作业', type: 'text', isRequired: true, publicationState: 'published',
      description: '描述', requirements: ['要求'], estimatedMinutes: 30, knowledgePointIds: [],
      dueAt: '2026-11-01T16:00:00Z', lateUntil: null, allowResubmit: true, maxAttempts: 3,
      maxScore: 10, rubric: [{ criterionId: 'c1', title: '正确性', description: '实现正确', maxScore: 10 }],
      initialFiles: [{ path: 'answer.md', content: '' }], aiPolicyVersion: null,
      publishedAt: '2026-10-14T02:00:00Z', submittedStudentCount: 1, pendingReviewCount: 0,
    }
    mockAssignmentStore.assignments.set(assignmentId, { dto, createdAt: '2026-10-14T02:00:00Z' })
    mockAssignmentStore.submissions.set(submissionId, {
      dto: {
        id: submissionId, assignmentId, offeringId: P1A_IDS.offeringPendingArchive, attemptNumber: 1,
        workspaceRevision: 1, submittedAt: '2026-10-14T03:00:00Z', late: false, superseded: false, feedbackStatus: 'none',
      },
      files: [{ path: 'answer.md', content: '# 归档前作答' }], reflection: '归档前提交。',
    })

    const path = `/api/v1/assignments/${assignmentId}`
    await call('getWorkspace', 'GET', `${path}/workspace`)
    // 幂等先于归档阻断：同 revision 重放返回原提交。
    const replay = await call('submitAssignment', 'POST', `${path}/submissions`, { body: { workspaceRevision: 1, reflection: '重放。' } })
    expect(replay.status).toBe(200)
    expect(replay.body.data.id).toBe(submissionId)
    const detail = await call('getSubmission', 'GET', `/api/v1/submissions/${submissionId}`)
    expect(detail.body.data.reflection).toBe('归档前提交。')
    // 新 revision 才受归档阻断。
    const blocked = await call('submitAssignment', 'POST', `${path}/submissions`, { body: { workspaceRevision: 99, reflection: '归档后新建。' } })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.code).toBe('OFFERING_ARCHIVED')
  })

  it('次数达上限后：已有 revision 重放仍 200，新 revision 提交 409 ATTEMPT_LIMIT_REACHED', async () => {
    await loginAs('student.demo')
    // 种子已占 1 次；再提交 revision 2、3 用满 maxAttempts=3。
    for (const revision of [2, 3]) {
      const submitted = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: revision, reflection: `第 ${revision - 1} 次。` } })
      expect(submitted.status).toBe(201)
      if (revision < 3) {
        const saved = await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
          body: { baseRevision: revision, activeFile: 'script.js', files: [{ path: 'script.js', content: `// v${revision + 1}` }] },
        })
        expect(saved.status).toBe(200)
      }
    }
    const replay = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 2, reflection: '上限后重放。' } })
    expect(replay.status).toBe(200)
    await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
      body: { baseRevision: 3, activeFile: 'script.js', files: [{ path: 'script.js', content: '// v4' }] },
    })
    const blocked = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 4, reflection: '超次数。' } })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.code).toBe('ATTEMPT_LIMIT_REACHED')
  })

  it('reflection 必填（缺省 422、空串接受）；workspaceRevision 冲突 409 带当前版本', async () => {
    await loginAs('student.demo')
    const missingReflection = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 2 } })
    expect(missingReflection.status).toBe(422)
    const emptyReflection = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 2, reflection: '' } })
    expect(emptyReflection.status).toBe(201)
    await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
      body: { baseRevision: 2, activeFile: 'script.js', files: [{ path: 'script.js', content: '// v3' }] },
    })
    const conflict = await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: 99, reflection: '' } })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('WORKSPACE_CONFLICT')
    expect(conflict.body.error.details.currentRevision).toBe(3)
  })
})

describe('F2 mock 契约对齐：saveWorkspace', () => {
  it('activeFile 必填且限定枚举；baseRevision=0 首次保存接受；冲突 409 WORKSPACE_CONFLICT', async () => {
    await loginAs('student.demo')
    const missingActiveFile = await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
      body: { baseRevision: 2, files: [{ path: 'script.js', content: '// x' }] },
    })
    expect(missingActiveFile.status).toBe(422)
    const badActiveFile = await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
      body: { baseRevision: 2, activeFile: 'evil.js', files: [{ path: 'script.js', content: '// x' }] },
    })
    expect(badActiveFile.status).toBe(422)
    const conflict = await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
      body: { baseRevision: 1, activeFile: 'script.js', files: [{ path: 'script.js', content: '// x' }] },
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('WORKSPACE_CONFLICT')
    expect(conflict.body.error.details.currentRevision).toBe(2)

    // 全新工作区（revision 0）首次保存：契约 baseRevision 最小 0。
    await loginAs('teacher.demo')
    const created = await call('createAssignment', 'POST', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/assignments`, {
      body: {
        chapterId: null, title: '全新作业', type: 'text', isRequired: true, description: '描述',
        requirements: ['要求'], estimatedMinutes: 30, knowledgePointIds: [], dueAt: '2026-11-01T16:00:00Z',
        allowResubmit: true, maxAttempts: 3, maxScore: 10,
        rubric: [{ criterionId: 'c1', title: '正确性', description: '实现正确', maxScore: 10 }],
        initialFiles: [{ path: 'answer.md', content: '' }],
      },
    })
    await call('publishAssignment', 'POST', `/api/v1/teacher/assignments/${created.body.data.id}/publish`, { body: {} })
    resetMockAuthState(); resetMockCookies()
    await loginAs('student.demo')
    const freshPath = `/api/v1/assignments/${created.body.data.id}`
    const workspace = await call('getWorkspace', 'GET', `${freshPath}/workspace`)
    expect(workspace.body.data.revision).toBe(0)
    const firstSave = await call('saveWorkspace', 'PUT', `${freshPath}/workspace`, {
      body: { baseRevision: 0, activeFile: 'answer.md', files: [{ path: 'answer.md', content: '# 首次保存' }] },
    })
    expect(firstSave.status).toBe(200)
    expect(firstSave.body.data.revision).toBe(1)
  })
})

describe('F2 mock 契约对齐：列表分页与教师提交列表', () => {
  it('listMySubmissions 返回完整分页结构', async () => {
    await loginAs('student.demo')
    // 种子 1 次 + 新提交 revision 2、3，共 3 条。
    for (const revision of [2, 3]) {
      await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: revision, reflection: `第 ${revision - 1} 次。` } })
      if (revision < 3) {
        await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
          body: { baseRevision: revision, activeFile: 'script.js', files: [{ path: 'script.js', content: `// v${revision + 1}` }] },
        })
      }
    }
    const page = await call('listMySubmissions', 'GET', `${assignmentPath}/submissions?page=2&pageSize=2`)
    expect(page.status).toBe(200)
    expect(page.body.data).toMatchObject({ page: 2, pageSize: 2, total: 3 })
    expect(page.body.data.items).toHaveLength(1)
    // 按提交时间倒序：第 2 页是最后一条（种子的 revision 1）。
    expect(page.body.data.items[0].workspaceRevision).toBe(1)
  })

  it('listTeacherSubmissions：latestOnly 默认过滤、feedbackStatus 筛选、分页与范围', async () => {
    await loginAs('student.demo')
    // 种子提交（revision 1）+ 新提交 revision 2、3；新提交使旧提交转为 superseded。
    for (const revision of [2, 3]) {
      await call('submitAssignment', 'POST', `${assignmentPath}/submissions`, { body: { workspaceRevision: revision, reflection: `第 ${revision - 1} 次。` } })
      if (revision < 3) {
        await call('saveWorkspace', 'PUT', `${assignmentPath}/workspace`, {
          body: { baseRevision: revision, activeFile: 'script.js', files: [{ path: 'script.js', content: `// v${revision + 1}` }] },
        })
      }
    }

    await loginAs('teacher.demo')
    const list = await call('listTeacherSubmissions', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/submissions`)
    expect(list.status).toBe(200)
    expect(list.body.data).toMatchObject({ page: 1, pageSize: 20, total: 1 })
    expect(list.body.data.items[0]).toMatchObject({
      workspaceRevision: 3, superseded: false, feedbackStatus: 'none',
      student: { username: 'student.demo' },
    })

    const currentId = list.body.data.items[0].id
    const draft = await call('saveFeedback', 'PUT', `/api/v1/teacher/submissions/${currentId}/feedback`, { body: { baseVersion: 0, score: 40, comment: '草稿', rubricResults: [{ criterionId: 'c1', score: 40, comment: 'ok' }], knowledgeEvaluations: [] } })
    expect(draft.status).toBe(201)
    const draftOnly = await call('listTeacherSubmissions', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/submissions?feedbackStatus=draft`)
    expect(draftOnly.body.data.total).toBe(1)
    const publishedOnly = await call('listTeacherSubmissions', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/submissions?feedbackStatus=published`)
    expect(publishedOnly.body.data.total).toBe(0)
    const all = await call('listTeacherSubmissions', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/submissions?latestOnly=false`)
    expect(all.body.data.total).toBe(3)

    expect((await call('listTeacherSubmissions', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/submissions?feedbackStatus=late`)).status).toBe(422)
    expect((await call('listTeacherSubmissions', 'GET', '/api/v1/teacher/assignments/00000000-0000-4000-8000-000000009999/submissions')).status).toBe(404)

    await loginAs('student.demo')
    expect((await call('listTeacherSubmissions', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/submissions`)).status).toBe(403)
  })

  it('listTeacherSubmissions：响应形状与 TeacherSubmissionSummaryDTO 对齐', async () => {
    await loginAs('teacher.demo')
    // 归档作业无提交；assignmentWeb 有种子提交一条。
    const archived = await call('listTeacherSubmissions', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentArchived}/submissions`)
    expect(archived.body.data.items).toHaveLength(0)
    const seeded = await call('listTeacherSubmissions', 'GET', `/api/v1/teacher/assignments/${P1B_IDS.assignmentWeb}/submissions`)
    expect(seeded.body.data).toMatchObject({ page: 1, pageSize: 20, total: 1 })
    expect(seeded.body.data.items[0]).toMatchObject({
      assignmentId: P1B_IDS.assignmentWeb, superseded: false, feedbackStatus: 'none',
      student: { id: expect.any(String), username: 'student.demo', displayName: expect.any(String) },
    })
  })
})

describe('F2 mock 契约对齐：publishFeedback 归档阻断', () => {
  it('作业归档后发布评价 409 ASSIGNMENT_ARCHIVED（先于幂等判定）', async () => {
    await loginAs('teacher.demo')
    const created = await call('createAssignment', 'POST', `/api/v1/teacher/offerings/${P1A_IDS.offeringWeb}/assignments`, {
      body: {
        chapterId: null, title: '待归档作业', type: 'text', isRequired: true, description: '描述',
        requirements: ['要求'], estimatedMinutes: 30, knowledgePointIds: [], dueAt: '2026-11-01T16:00:00Z',
        allowResubmit: true, maxAttempts: 3, maxScore: 10,
        rubric: [{ criterionId: 'c1', title: '正确性', description: '实现正确', maxScore: 10 }],
        initialFiles: [{ path: 'answer.md', content: '' }],
      },
    })
    const assignmentId = created.body.data.id
    await call('publishAssignment', 'POST', `/api/v1/teacher/assignments/${assignmentId}/publish`, { body: {} })
    resetMockAuthState(); resetMockCookies()
    await loginAs('student.demo')
    await call('getWorkspace', 'GET', `/api/v1/assignments/${assignmentId}/workspace`)
    const saved = await call('saveWorkspace', 'PUT', `/api/v1/assignments/${assignmentId}/workspace`, {
      body: { baseRevision: 0, activeFile: 'answer.md', files: [{ path: 'answer.md', content: '# 作答' }] },
    })
    expect(saved.status).toBe(200)
    const submitted = await call('submitAssignment', 'POST', `/api/v1/assignments/${assignmentId}/submissions`, { body: { workspaceRevision: 1, reflection: '作答。' } })
    resetMockAuthState(); resetMockCookies()
    await loginAs('teacher.demo')
    const submissionId = submitted.body.data.id
    const draft = await call('saveFeedback', 'PUT', `/api/v1/teacher/submissions/${submissionId}/feedback`, { body: { baseVersion: 0, score: 8, comment: '好', rubricResults: [{ criterionId: 'c1', score: 8, comment: 'ok' }], knowledgeEvaluations: [] } })
    expect(draft.status).toBe(201)
    await call('archiveAssignment', 'POST', `/api/v1/teacher/assignments/${assignmentId}/archive`, { body: {} })
    const publish = await call('publishFeedback', 'POST', `/api/v1/teacher/submissions/${submissionId}/feedback/publish`, { body: { baseVersion: 1 } })
    expect(publish.status).toBe(409)
    expect(publish.body.error.code).toBe('ASSIGNMENT_ARCHIVED')
  })
})

describe('F2 mock 契约对齐：recordLearningEvents 冲突与回滚', () => {
  const uuid = (value: number) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
  const OFFERING = uuid(201), CHAPTER = uuid(301), ASSIGNMENT = uuid(701), SESSION = uuid(999)
  const OCCURRED = '2026-10-24T10:00:00Z'
  const chapterEvent = (id: string) => ({
    eventId: id, sessionId: SESSION, occurredAt: OCCURRED,
    offeringId: OFFERING, chapterId: CHAPTER, type: 'chapter_opened', payload: {},
  })
  const editorEvent = (id: string, file = 'script.js') => ({
    eventId: id, sessionId: SESSION, occurredAt: OCCURRED,
    offeringId: OFFERING, assignmentId: ASSIGNMENT, type: 'editor_opened', payload: { activeFile: file },
  })
  const eventsPath = '/api/v1/me/learning-events'

  it('同 eventId 不同正文 409 EVENT_CONFLICT', async () => {
    await loginAs('student.demo')
    const first = await call('recordLearningEvents', 'POST', eventsPath, { body: { events: [editorEvent(uuid(2001))] } })
    expect(first.body.data).toMatchObject({ acceptedCount: 1, duplicateCount: 0 })
    const conflict = await call('recordLearningEvents', 'POST', eventsPath, { body: { events: [editorEvent(uuid(2001), 'style.css')] } })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('EVENT_CONFLICT')
    // 键序不同但正文相同仍计 duplicate。
    const reordered = await call('recordLearningEvents', 'POST', eventsPath, {
      body: { events: [{ payload: {}, type: 'chapter_opened', chapterId: CHAPTER, offeringId: OFFERING, occurredAt: OCCURRED, sessionId: SESSION, eventId: uuid(3001) }] },
    })
    expect(reordered.body.data).toMatchObject({ acceptedCount: 1, duplicateCount: 0 })
    const reorderedAgain = await call('recordLearningEvents', 'POST', eventsPath, {
      body: { events: [{ payload: {}, type: 'chapter_opened', chapterId: CHAPTER, offeringId: OFFERING, occurredAt: OCCURRED, sessionId: SESSION, eventId: uuid(3001) }] },
    })
    expect(reorderedAgain.body.data.duplicateCount).toBe(1)
  })

  it('冲突整批回滚：批内新事件不落库，可随后单独重发', async () => {
    await loginAs('student.demo')
    await call('recordLearningEvents', 'POST', eventsPath, { body: { events: [editorEvent(uuid(2001))] } })
    const fresh = chapterEvent(uuid(2002))
    const batch = await call('recordLearningEvents', 'POST', eventsPath, {
      body: { events: [fresh, editorEvent(uuid(2001), 'answer.sql')] },
    })
    expect(batch.status).toBe(409)
    // 整批回滚：新事件未写入，随后单独重发被接受。
    const resend = await call('recordLearningEvents', 'POST', eventsPath, { body: { events: [fresh] } })
    expect(resend.status).toBe(200)
    expect(resend.body.data.acceptedCount).toBe(1)
  })

  it('批内同 eventId 不同正文同样冲突', async () => {
    await loginAs('student.demo')
    const batch = await call('recordLearningEvents', 'POST', eventsPath, {
      body: { events: [editorEvent(uuid(2003)), editorEvent(uuid(2003), 'style.css')] },
    })
    expect(batch.status).toBe(409)
    expect(batch.body.error.code).toBe('EVENT_CONFLICT')
  })
})
