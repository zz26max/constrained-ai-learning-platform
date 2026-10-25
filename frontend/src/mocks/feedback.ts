import type {
  AssignmentSnapshot, FeedbackWrite, NotificationDTO, StudentFeedbackDTO, SubmissionDetailDTO,
  TeacherFeedbackDTO, TeacherSubmissionDetailDTO,
} from '../api/assignments'
import { mockSession } from './auth'
import { P1A_IDS, mockKnowledgeSnapshot } from './courses'
import { mockAssignmentStore, P1B_IDS } from './assignments'
import { fail, guard, invalid, isEmptyObject, isUuid, MOCK_STUDENT, MOCK_TEACHER, missing, ok, pageWindow, paginate, searchParams, segment } from './envelope'
import { ISSUE_TAGS } from './tutoring'
import { randomUUID } from './random'
import type { MockHandler, MockRequestContext, MockResult } from './types'

type Body = Record<string, unknown>

const fixtureTime = '2026-10-14T02:00:00Z'
const now = () => new Date().toISOString()

export interface StoredMessage { dto: NotificationDTO; recipientId: string }

/** 通知、公告和反馈发布共用的内存消息表。 */
export const mockMessages: StoredMessage[] = []
const feedbacks = new Map<string, TeacherFeedbackDTO>()
const feedbackMessage = new Map<string, string>()

const teacherBrief = { id: MOCK_TEACHER.id, displayName: MOCK_TEACHER.displayName }

export function addMockMessage(message: Omit<NotificationDTO, 'id' | 'readAt'>, recipientId: string = MOCK_STUDENT.id): NotificationDTO {
  const dto: NotificationDTO = { ...message, id: randomUUID(), readAt: null }
  mockMessages.push({ dto, recipientId })
  return dto
}

export function resetMockFeedbackState(): void {
  mockMessages.length = 0
  feedbacks.clear()
  feedbackMessage.clear()
  addMockMessage({
    offeringId: P1A_IDS.offeringWeb, type: 'course_notice', title: '欢迎加入课程',
    content: '请先阅读第一章并完成本周作业。', sender: teacherBrief, createdAt: fixtureTime, target: null,
  })
  addMockMessage({
    offeringId: P1A_IDS.offeringWeb, type: 'assignment_published', title: '新作业：HTML 表单实现',
    content: '作业已发布，请在截止前提交。', sender: teacherBrief, createdAt: '2026-10-14T01:00:00Z',
    target: { type: 'assignment', id: P1B_IDS.assignmentWeb, offeringId: P1A_IDS.offeringWeb },
  })
}
resetMockFeedbackState()

export function studentFeedbackView(feedback: TeacherFeedbackDTO): StudentFeedbackDTO {
  return {
    id: feedback.id, submissionId: feedback.submissionId, offeringId: feedback.offeringId,
    assignmentId: feedback.assignmentId, assignmentTitle: feedback.assignmentTitle, version: feedback.version,
    status: 'published', score: feedback.score, maxScore: feedback.maxScore, rubricResults: feedback.rubricResults,
    comment: feedback.comment, knowledgeEvaluations: feedback.knowledgeEvaluations, issueTags: feedback.issueTags,
    issueTagVersion: feedback.issueTagVersion, teacher: feedback.teacher,
    publishedAt: feedback.publishedAt ?? fixtureTime, messageId: feedbackMessage.get(feedback.id) ?? randomUUID(),
  }
}

export function publishedFeedbacks(): TeacherFeedbackDTO[] {
  return [...feedbacks.values()].filter(feedback => feedback.status === 'published')
}

export function publishedFeedbackFor(submissionId: string): TeacherFeedbackDTO | null {
  const feedback = feedbacks.get(submissionId)
  return feedback !== undefined && feedback.status === 'published' ? feedback : null
}

function snapshot(assignmentId: string): AssignmentSnapshot | null {
  const stored = mockAssignmentStore.assignments.get(assignmentId)
  if (stored === undefined) return null
  const dto = stored.dto
  return {
    title: dto.title, requirements: dto.requirements, rubric: dto.rubric, maxScore: dto.maxScore,
    knowledgePoints: mockKnowledgeSnapshot(dto.knowledgePointIds), contentVersion: 1, dueAt: dto.dueAt, aiPolicyVersion: dto.aiPolicyVersion,
  }
}

const isBody = (value: unknown): value is Body => value !== null && typeof value === 'object' && !Array.isArray(value)

const KNOWLEDGE_RESULTS = ['meets_expectation', 'needs_practice', 'insufficient_evidence'] as const

function feedbackWrite(value: unknown, maxScore: number): value is FeedbackWrite {
  if (!isBody(value)) return false
  const allowed = ['baseVersion', 'score', 'rubricResults', 'comment', 'knowledgeEvaluations', 'issueTags']
  if (!Object.keys(value).every(key => allowed.includes(key))) return false
  if (typeof value['baseVersion'] !== 'number' || !Number.isInteger(value['baseVersion']) || value['baseVersion'] < 0) return false
  if (typeof value['score'] !== 'number' || value['score'] < 0 || value['score'] > maxScore) return false
  if (typeof value['comment'] !== 'string' || value['comment'].length > 8000) return false
  if (!Array.isArray(value['knowledgeEvaluations'])) return false
  if (!(value['knowledgeEvaluations'] as unknown[]).every(item => isBody(item)
    && typeof item['knowledgePointId'] === 'string' && isUuid(item['knowledgePointId'])
    && KNOWLEDGE_RESULTS.includes(item['result'] as never)
    && typeof item['note'] === 'string' && item['note'].length <= 8000)) return false
  const tags = value['issueTags']
  if (tags !== undefined && (!Array.isArray(tags) || !tags.every(tag => typeof tag === 'string' && tag.length >= 1 && tag.length <= 64))) return false
  const rubric = value['rubricResults']
  return Array.isArray(rubric) && rubric.length >= 1 && rubric.every(item => isBody(item)
    && typeof item['criterionId'] === 'string' && typeof item['score'] === 'number' && typeof item['comment'] === 'string')
}

function submissionDetail(id: string, teacherView: boolean): SubmissionDetailDTO | TeacherSubmissionDetailDTO | null {
  const stored = mockAssignmentStore.submissions.get(id)
  if (stored === undefined) return null
  const assignmentSnapshot = snapshot(stored.dto.assignmentId)
  if (assignmentSnapshot === null) return null
  const feedback = feedbacks.get(id)
  const published = feedback !== undefined && feedback.status === 'published' ? feedback : null
  if (!teacherView) {
    return {
      ...stored.dto, feedbackStatus: published !== null ? 'published' : 'none', files: stored.files,
      reflection: stored.reflection, assignmentSnapshot,
      publishedFeedback: published !== null ? studentFeedbackView(published) : null,
    }
  }
  return {
    ...stored.dto, feedbackStatus: published !== null ? 'published' : feedback !== undefined ? 'draft' : 'none',
    student: { id: MOCK_STUDENT.id, username: MOCK_STUDENT.username, displayName: MOCK_STUDENT.displayName },
    files: stored.files, reflection: stored.reflection, assignmentSnapshot, publishedFeedback: published,
    draftFeedback: feedback !== undefined && feedback.status === 'draft' ? feedback : null,
  }
}

function handleSubmission(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student', 'teacher'])
  if (denied !== null) return denied
  const id = segment(context, 3)
  if (!isUuid(id)) return missing(context)
  const teacherView = mockSession()?.account.roles.includes('teacher') === true
  const detail = submissionDetail(id, teacherView)
  return detail === null ? missing(context) : ok(context, detail)
}

function handleSaveFeedback(context: MockRequestContext): MockResult {
  const denied = guard(context, ['teacher'])
  if (denied !== null) return denied
  const id = segment(context, 4)
  const submission = mockAssignmentStore.submissions.get(id)
  const assignment = submission === undefined ? undefined : mockAssignmentStore.assignments.get(submission.dto.assignmentId)
  if (submission === undefined || assignment === undefined) return missing(context)
  if (!feedbackWrite(context.bodyJson, assignment.dto.maxScore)) return invalid(context)
  const body = context.bodyJson
  // P2 约束：知识评价 ID 不重复且属于提交快照的知识点；问题标签来自班级词表且不重复。
  const snapshotPoints = mockKnowledgeSnapshot(assignment.dto.knowledgePointIds)
  const pointIds = new Set(snapshotPoints.map(point => point.id))
  const evaluationIds = body.knowledgeEvaluations.map(item => item.knowledgePointId)
  if (new Set(evaluationIds).size !== evaluationIds.length) return invalid(context, '知识点评价不能重复。', 'knowledgeEvaluations')
  if (evaluationIds.some(pointId => !pointIds.has(pointId))) return invalid(context, '知识点评价只能针对提交快照中的知识点。', 'knowledgeEvaluations')
  const vocabulary = ISSUE_TAGS.items.map(item => item.tag as string)
  const tags = body.issueTags ?? []
  if (new Set(tags).size !== tags.length) return invalid(context, '问题标签不能重复。', 'issueTags')
  if (tags.some(tag => !vocabulary.includes(tag))) return invalid(context, '问题标签只能选择本班词表中的选项。', 'issueTags')
  if (submission.dto.superseded) return fail(context, 409, 'SUBMISSION_SUPERSEDED', '该提交已被新提交替代。')
  const existing = feedbacks.get(id)
  if (existing !== undefined && existing.status === 'published') return fail(context, 409, 'FEEDBACK_ALREADY_PUBLISHED', '反馈已发布，不能再修改。')
  const currentVersion = existing?.version ?? 0
  if (body.baseVersion !== currentVersion) return fail(context, 409, 'FEEDBACK_VERSION_CONFLICT', '反馈版本已过期，请刷新后重试。')
  const feedback: TeacherFeedbackDTO = {
    id: existing?.id ?? randomUUID(), submissionId: id, offeringId: submission.dto.offeringId,
    assignmentId: submission.dto.assignmentId, assignmentTitle: assignment.dto.title, version: currentVersion + 1,
    status: 'draft', score: body.score, maxScore: assignment.dto.maxScore, rubricResults: body.rubricResults,
    comment: body.comment, knowledgeEvaluations: body.knowledgeEvaluations, issueTags: body.issueTags ?? [],
    issueTagVersion: body.issueTags !== undefined && body.issueTags.length > 0 ? ISSUE_TAGS.version : existing?.issueTagVersion ?? null,
    teacher: teacherBrief, publishedAt: null, messageId: null,
  }
  feedbacks.set(id, feedback)
  return ok(context, feedback, existing === undefined ? 201 : 200)
}

function handlePublishFeedback(context: MockRequestContext): MockResult {
  const denied = guard(context, ['teacher'])
  if (denied !== null) return denied
  const id = segment(context, 4)
  const feedback = feedbacks.get(id)
  if (feedback === undefined) return missing(context)
  const body = context.bodyJson
  if (!isBody(body) || Object.keys(body).length !== 1 || typeof body['baseVersion'] !== 'number' || !Number.isInteger(body['baseVersion'])) return invalid(context)
  if (feedback.status === 'published') return fail(context, 409, 'FEEDBACK_ALREADY_PUBLISHED', '反馈已发布。')
  if (body['baseVersion'] !== feedback.version) return fail(context, 409, 'FEEDBACK_VERSION_CONFLICT', '反馈版本已过期，请刷新后重试。')
  const published: TeacherFeedbackDTO = { ...feedback, status: 'published', version: feedback.version + 1, publishedAt: now() }
  feedbacks.set(id, published)
  const submission = mockAssignmentStore.submissions.get(id)
  if (submission !== undefined) submission.dto.feedbackStatus = 'published'
  mockAssignmentStore.publishedFeedbackByAssignment.set(published.assignmentId, published.id)
  const message = addMockMessage({
    offeringId: published.offeringId, type: 'feedback', title: `「${published.assignmentTitle}」已有教师反馈`,
    content: '教师已发布作业反馈，请查看。', sender: teacherBrief, createdAt: published.publishedAt ?? now(),
    target: { type: 'feedback', id: published.id, offeringId: published.offeringId },
  })
  feedbackMessage.set(published.id, message.id)
  return ok(context, published)
}

function handleGetFeedback(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student'])
  if (denied !== null) return denied
  const id = segment(context, 4)
  const feedback = publishedFeedbacks().find(item => item.id === id)
  return feedback === undefined ? missing(context) : ok(context, studentFeedbackView(feedback))
}

function handleListMessages(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student', 'teacher'])
  if (denied !== null) return denied
  const params = searchParams(context)
  const window = pageWindow(params)
  const offeringId = params.get('offeringId'), type = params.get('type'), read = params.get('read') ?? 'all'
  if (window === null || !['all', 'unread', 'read'].includes(read) || (offeringId !== null && !isUuid(offeringId))) return invalid(context, '查询参数不合法。', 'query')
  const userId = mockSession()?.account.id
  const scoped = mockMessages.filter(item => item.recipientId === userId
    && (offeringId === null || item.dto.offeringId === offeringId) && (type === null || item.dto.type === type))
  const filtered = scoped
    .filter(item => read === 'all' || (read === 'unread') === (item.dto.readAt === null))
    .map(item => item.dto)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const unreadCount = scoped.filter(item => item.dto.readAt === null).length
  return ok(context, { ...paginate(filtered, window), summary: { unreadCount } })
}

function handleReadMessage(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student', 'teacher'])
  if (denied !== null) return denied
  if (!isEmptyObject(context.bodyJson)) return invalid(context)
  const id = segment(context, 4)
  const message = mockMessages.find(item => item.dto.id === id && item.recipientId === mockSession()?.account.id)
  if (message === undefined) return missing(context)
  message.dto.readAt = message.dto.readAt ?? now()
  return ok(context, { id, readAt: message.dto.readAt })
}

export const feedbackHandlers: Record<string, MockHandler> = {
  getSubmission: handleSubmission,
  saveFeedback: handleSaveFeedback,
  publishFeedback: handlePublishFeedback,
  getFeedback: handleGetFeedback,
  listMessages: handleListMessages,
  readMessage: handleReadMessage,
}
