import type { components } from '../api/generated/schema'
import type {
  AssignmentSummaryDTO, AssignmentDetailDTO, WorkspaceDTO, SubmissionSummaryDTO,
  TeacherAssignmentDTO, AssignmentWriteDTO, AssignmentPatch, WorkspaceWrite, SubmissionWrite,
} from '../api/assignments'
import { MOCK_TERM, mockSession, requireMockSession, validateMockCsrf } from './auth'
import { P1A_IDS } from './courses'
import { randomUUID } from './random'
import type { MockHandler, MockRequestContext, MockResult } from './types'

type FileDTO = components['schemas']['FileDTO']
type RubricCriterion = components['schemas']['RubricCriterion']
type Body = Record<string, unknown>

const uuid = (value: number) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
export const P1B_IDS = {
  assignmentWeb: uuid(701), assignmentDraft: uuid(702), assignmentArchived: uuid(703),
  submissionWeb1: uuid(801), submissionWeb2: uuid(802),
} as const

const fixtureTime = '2026-10-14T02:00:00Z'
const now = () => new Date().toISOString()
const STUDENT_ID = uuid(1), TEACHER_ID = uuid(2)

interface StoredAssignment { dto: TeacherAssignmentDTO; createdAt: string }
interface StoredWorkspace { dto: WorkspaceDTO; assignmentId: string }
interface StoredSubmission { dto: SubmissionSummaryDTO; files: FileDTO[]; reflection: string }

const assignments = new Map<string, StoredAssignment>()
const workspaces = new Map<string, StoredWorkspace>()
const submissions = new Map<string, StoredSubmission>()

const fixtureRubric: RubricCriterion[] = [
  { criterionId: 'c1', title: '代码正确性', description: '实现符合需求', maxScore: 50 },
  { criterionId: 'c2', title: '代码质量', description: '结构清晰易读', maxScore: 30 },
]

const fixtureInitialFiles: FileDTO[] = [
  { path: 'script.js', content: '// 在此编写代码\n' },
  { path: 'index.html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>作业</title>\n</head>\n<body>\n  <script src="script.js"></script>\n</body>\n</html>\n' },
]

function seedAssignment(id: string, offeringId: string, chapterId: string, publicationState: 'draft' | 'published' | 'archived', title: string): void {
  const dto: TeacherAssignmentDTO = {
    id, offeringId, chapterId, title, type: 'web_lab', isRequired: true,
    publicationState, description: '完成编程任务', requirements: ['实现功能', '通过测试'],
    estimatedMinutes: 120, knowledgePointIds: [P1A_IDS.knowledgeWeb],
    dueAt: '2026-11-01T16:00:00Z', lateUntil: '2026-11-03T16:00:00Z',
    allowResubmit: true, maxAttempts: 3, maxScore: 80, rubric: fixtureRubric,
    initialFiles: fixtureInitialFiles, aiPolicyVersion: 1,
    publishedAt: publicationState === 'published' ? fixtureTime : null,
    submittedStudentCount: 0, pendingReviewCount: 0,
  }
  assignments.set(id, { dto, createdAt: fixtureTime })
}

export function resetMockAssignmentState(): void {
  assignments.clear()
  workspaces.clear()
  submissions.clear()
  seedAssignment(P1B_IDS.assignmentWeb, P1A_IDS.offeringWeb, P1A_IDS.chapterWeb, 'published', 'HTML 表单实现')
  seedAssignment(P1B_IDS.assignmentDraft, P1A_IDS.offeringWeb, P1A_IDS.chapterWeb, 'draft', '草稿作业')
  seedAssignment(P1B_IDS.assignmentArchived, P1A_IDS.offeringWeb, P1A_IDS.chapterArchived, 'archived', '归档作业')

  workspaces.set(P1B_IDS.assignmentWeb, {
    assignmentId: P1B_IDS.assignmentWeb,
    dto: {
      assignmentId: P1B_IDS.assignmentWeb, revision: 1,
      files: [{ path: 'script.js', content: '// 学生工作区代码\n' }],
      activeFile: 'script.js', savedAt: fixtureTime, canSave: true, saveBlockedReason: null,
    },
  })
}
resetMockAssignmentState()

const requestId = (context: MockRequestContext) => context.headers['X-Request-ID'] || randomUUID()
const ok = (context: MockRequestContext, data: unknown, status = 200): MockResult => ({ status, bodyJson: { data: structuredClone(data), requestId: requestId(context) } })
const fail = (context: MockRequestContext, status: number, code: string, message: string, details: unknown = {}): MockResult => ({ status, bodyJson: { error: { code, message, details }, requestId: requestId(context) } })
const invalid = (context: MockRequestContext, message = '输入不符合要求。', field = 'body'): MockResult => ({ status: 422, bodyJson: { error: { code: 'VALIDATION_ERROR', message, details: { fields: [{ field, message }] } }, requestId: requestId(context) } })
const missing = (context: MockRequestContext) => fail(context, 404, 'NOT_FOUND', '对象不存在或不可访问。')
const archived = (context: MockRequestContext) => fail(context, 409, 'OFFERING_ARCHIVED', '教学班已归档，当前只能查看历史内容。')

const idFor = (context: MockRequestContext) => new URL(context.path, 'http://mock.local').pathname.split('/').filter(Boolean).at(-1) || ''

const object = (value: unknown): value is Body => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, maximum: number, minimum = 0): value is string => typeof value === 'string' && value.length >= minimum && value.length <= maximum
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value))
const optional = (body: Body, key: string, validate: (value: unknown) => boolean) => body[key] === undefined || validate(body[key])
const allowed = (body: Body, names: string[]) => Object.keys(body).length > 0 && Object.keys(body).every(name => names.includes(name))

function assignmentWrite(value: unknown): value is AssignmentWriteDTO {
  if (!object(value)) return false
  const required = ['chapterId', 'title', 'type', 'isRequired', 'description', 'requirements', 'estimatedMinutes', 'knowledgePointIds', 'dueAt', 'allowResubmit', 'maxAttempts', 'maxScore', 'rubric', 'initialFiles']
  if (!required.every(key => key in value)) return false
  const validTypes = ['web_lab', 'sql_text', 'text']
  return text(value.title, 200, 1) && typeof value.type === 'string' && validTypes.includes(value.type)
}

function assignmentPatch(value: unknown): value is AssignmentPatch {
  return object(value) && allowed(value, ['title', 'description', 'requirements', 'estimatedMinutes', 'dueAt', 'lateUntil', 'maxScore', 'rubric'])
}

function workspaceWrite(value: unknown): value is WorkspaceWrite {
  if (!object(value)) return false
  if (!('files' in value) || !Array.isArray(value.files)) return false
  if (!('baseRevision' in value) || !integer(value.baseRevision)) return false
  return optional(value, 'activeFile', v => typeof v === 'string')
}

function submissionWrite(value: unknown): value is SubmissionWrite {
  if (!object(value)) return false
  if (!('workspaceRevision' in value) || !integer(value.workspaceRevision)) return false
  return optional(value, 'reflection', v => typeof v === 'string')
}

function toSummary(assignment: TeacherAssignmentDTO, userId: string): AssignmentSummaryDTO {
  const workspace = workspaces.get(assignment.id)
  const userSubmissions = [...submissions.values()].filter(s => s.dto.assignmentId === assignment.id)
  const latest = userSubmissions.sort((a, b) => b.dto.submittedAt.localeCompare(a.dto.submittedAt))[0]

  const pubState = assignment.publicationState === 'draft' ? 'published' : assignment.publicationState
  return {
    id: assignment.id, offeringId: assignment.offeringId, offeringStatus: 'active',
    chapterId: assignment.chapterId, title: assignment.title, type: assignment.type,
    isRequired: assignment.isRequired, publicationState: pubState,
    description: assignment.description, dueAt: assignment.dueAt,
    assignmentState: latest ? 'SUBMITTED' : (workspace ? 'IN_PROGRESS' : 'NOT_STARTED'),
    overdue: new Date(assignment.dueAt) < new Date() && !latest,
    latestSubmissionId: latest?.dto.id || null, publishedFeedbackId: null, unreadFeedback: false,
  }
}

function toDetail(assignment: TeacherAssignmentDTO, userId: string): AssignmentDetailDTO {
  const summary = toSummary(assignment, userId)
  const userSubmissions = [...submissions.values()].filter(s => s.dto.assignmentId === assignment.id)

  return {
    ...summary, requirements: assignment.requirements, estimatedMinutes: assignment.estimatedMinutes,
    maxScore: assignment.maxScore, rubric: assignment.rubric, knowledgePointIds: assignment.knowledgePointIds,
    lateUntil: assignment.lateUntil, allowResubmit: assignment.allowResubmit,
    maxAttempts: assignment.maxAttempts, attemptsUsed: userSubmissions.length,
    canSubmit: userSubmissions.length < assignment.maxAttempts && assignment.publicationState === 'published',
    submissionBlockedReason: userSubmissions.length >= assignment.maxAttempts ? 'ATTEMPT_LIMIT_REACHED' : null,
    aiPolicyVersion: assignment.aiPolicyVersion,
  }
}

function handleAssignment(context: MockRequestContext): MockResult {
  const unavailable = requireMockSession(context)
  if (unavailable !== null) return unavailable
  const session = mockSession()
  if (session === null) return fail(context, 401, 'UNAUTHENTICATED', '会话不存在或已过期。')

  if (context.method !== 'GET') {
    const csrfFailure = validateMockCsrf(context)
    if (csrfFailure !== null) return csrfFailure
  }

  const account = session.account, userId = account.id, operation = context.operationId
  const teacherOperation = context.path.startsWith('/api/v1/teacher/')
  const studentOperation = ['listMyAssignments', 'getAssignment', 'getWorkspace', 'saveWorkspace', 'submitAssignment', 'listMySubmissions'].includes(operation)

  if ((teacherOperation && !account.roles.includes('teacher')) || (studentOperation && !account.roles.includes('student'))) {
    return fail(context, 403, 'FORBIDDEN', '当前角色不能执行此操作。')
  }

  const id = idFor(context), body = context.bodyJson
  const query = new URL(context.path, 'http://mock.local').searchParams

  if (operation === 'listMyAssignments') {
    const chapterId = query.get('chapterId')
    if (chapterId && !identifier(chapterId)) return invalid(context, '章节标识不合法。')

    const items = [...assignments.values()]
      .filter(a => a.dto.publicationState === 'published' && (!chapterId || a.dto.chapterId === chapterId))
      .map(a => toSummary(a.dto, userId))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))

    return ok(context, { items })
  }

  if (operation === 'getAssignment') {
    const stored = assignments.get(id)
    if (!stored || stored.dto.publicationState !== 'published') return missing(context)
    return ok(context, toDetail(stored.dto, userId))
  }

  if (operation === 'getWorkspace') {
    const stored = workspaces.get(id)
    if (!stored) {
      const assignment = assignments.get(id)
      if (!assignment || assignment.dto.publicationState !== 'published') return missing(context)
      const newWorkspace: WorkspaceDTO = {
        assignmentId: id, revision: 0, files: assignment.dto.initialFiles,
        activeFile: assignment.dto.initialFiles[0]?.path || 'script.js',
        savedAt: null, canSave: true, saveBlockedReason: null,
      }
      workspaces.set(id, { assignmentId: id, dto: newWorkspace })
      return ok(context, newWorkspace)
    }
    return ok(context, stored.dto)
  }

  if (operation === 'saveWorkspace') {
    if (!workspaceWrite(body)) return invalid(context)
    const stored = workspaces.get(id)
    const assignment = assignments.get(id)
    if (!assignment || assignment.dto.publicationState !== 'published') return missing(context)
    if (assignment.dto.offeringId === P1A_IDS.offeringPendingArchive) return archived(context)

    const currentRevision = stored?.dto.revision || 0
    if (body.baseRevision !== currentRevision) {
      return fail(context, 409, 'VERSION_CONFLICT', '工作区已被修改，请刷新后重试。')
    }

    const updated: WorkspaceDTO = {
      assignmentId: id, revision: currentRevision + 1, files: body.files,
      activeFile: body.activeFile ?? body.files[0]?.path ?? 'script.js',
      savedAt: now(), canSave: true, saveBlockedReason: null,
    }
    workspaces.set(id, { assignmentId: id, dto: updated })
    return ok(context, updated)
  }

  if (operation === 'submitAssignment') {
    if (!submissionWrite(body)) return invalid(context)
    const workspace = workspaces.get(id)
    const assignment = assignments.get(id)
    if (!assignment || assignment.dto.publicationState !== 'published') return missing(context)
    if (assignment.dto.offeringId === P1A_IDS.offeringPendingArchive) return archived(context)
    if (!workspace || workspace.dto.revision !== body.workspaceRevision) {
      return fail(context, 409, 'VERSION_CONFLICT', '工作区已被修改，请刷新后重试。')
    }

    const userSubmissions = [...submissions.values()].filter(s => s.dto.assignmentId === id)
    if (userSubmissions.length >= assignment.dto.maxAttempts) {
      return fail(context, 409, 'MAX_ATTEMPTS_REACHED', '已达到最大提交次数。')
    }

    const existing = userSubmissions.find(s => s.dto.workspaceRevision === body.workspaceRevision)
    if (existing) {
      return fail(context, 409, 'DUPLICATE_SUBMISSION', '该工作区版本已提交，不能重复提交。')
    }

    const submission: SubmissionSummaryDTO = {
      id: randomUUID(), assignmentId: id, offeringId: assignment.dto.offeringId,
      attemptNumber: userSubmissions.length + 1, workspaceRevision: body.workspaceRevision,
      submittedAt: now(), late: new Date() > new Date(assignment.dto.dueAt),
      superseded: false, feedbackStatus: 'none',
    }
    submissions.set(submission.id, { dto: submission, files: workspace.dto.files, reflection: body.reflection || '' })
    return ok(context, submission, 201)
  }

  if (operation === 'listMySubmissions') {
    const items = [...submissions.values()]
      .filter(s => s.dto.assignmentId === id)
      .map(s => s.dto)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    return ok(context, { items })
  }

  if (operation === 'listTeacherAssignments') {
    const offeringId = new URL(context.path, 'http://mock.local').pathname.split('/').filter(Boolean)[4] || ''
    const items = [...assignments.values()]
      .filter(a => a.dto.offeringId === offeringId)
      .map(a => a.dto)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    return ok(context, { items })
  }

  if (operation === 'createAssignment') {
    if (!assignmentWrite(body)) return invalid(context)
    const offeringId = new URL(context.path, 'http://mock.local').pathname.split('/').filter(Boolean)[4] || ''
    if (offeringId === P1A_IDS.offeringPendingArchive) return archived(context)

    const dto: TeacherAssignmentDTO = {
      id: randomUUID(), offeringId, publicationState: 'draft',
      publishedAt: null, submittedStudentCount: 0, pendingReviewCount: 0,
      chapterId: body.chapterId ?? null,
      title: body.title,
      type: body.type,
      isRequired: body.isRequired,
      description: body.description,
      requirements: body.requirements,
      estimatedMinutes: body.estimatedMinutes,
      knowledgePointIds: body.knowledgePointIds,
      dueAt: body.dueAt,
      lateUntil: body.lateUntil ?? null,
      allowResubmit: body.allowResubmit,
      maxAttempts: body.maxAttempts,
      maxScore: body.maxScore,
      rubric: body.rubric,
      initialFiles: body.initialFiles,
      aiPolicyVersion: null,
    }
    assignments.set(dto.id, { dto, createdAt: now() })
    return ok(context, dto, 201)
  }

  if (operation === 'getTeacherAssignment') {
    const stored = assignments.get(id)
    if (!stored) return missing(context)
    return ok(context, stored.dto)
  }

  if (operation === 'patchAssignment') {
    if (!assignmentPatch(body)) return invalid(context)
    const stored = assignments.get(id)
    if (!stored) return missing(context)
    if (stored.dto.publicationState === 'archived') {
      return fail(context, 409, 'ASSIGNMENT_ARCHIVED', '归档作业不能继续修改。')
    }
    Object.assign(stored.dto, body)
    return ok(context, stored.dto)
  }

  if (operation === 'publishAssignment') {
    if (!object(body) || Object.keys(body).length !== 0) return invalid(context)
    const stored = assignments.get(id)
    if (!stored) return missing(context)
    if (stored.dto.publicationState === 'archived') {
      return fail(context, 409, 'ASSIGNMENT_ARCHIVED', '归档作业不能继续修改。')
    }
    stored.dto.publicationState = 'published'
    stored.dto.publishedAt = now()
    return ok(context, stored.dto)
  }

  if (operation === 'archiveAssignment') {
    if (!object(body) || Object.keys(body).length !== 0) return invalid(context)
    const stored = assignments.get(id)
    if (!stored) return missing(context)
    if (stored.dto.pendingReviewCount > 0) {
      return fail(context, 409, 'ARCHIVE_PENDING_REVIEWS', '存在待批阅提交，不能归档。')
    }
    stored.dto.publicationState = 'archived'
    return ok(context, stored.dto)
  }

  return missing(context)
}

export const assignmentHandlers: Record<string, MockHandler> = Object.fromEntries([
  'listMyAssignments', 'getAssignment', 'getWorkspace', 'saveWorkspace', 'submitAssignment', 'listMySubmissions',
  'listTeacherAssignments', 'createAssignment', 'getTeacherAssignment', 'patchAssignment', 'publishAssignment', 'archiveAssignment',
].map(operationId => [operationId, handleAssignment]))
