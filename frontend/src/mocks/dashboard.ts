import type { DashboardDTO, LearningRecordsDTO } from '../api/dashboard'
import type { NoticeDTO, NoticeWrite } from '../api/notices'
import type { TeacherLearningRecordsDTO } from '../api/stats'
import { MOCK_TERM, mockSession } from './auth'
import { P1A_FIXTURES, P1A_IDS } from './courses'
import { mockAssignmentStore, toSummary } from './assignments'
import { addMockMessage, mockMessages, publishedFeedbackFor, publishedFeedbacks, studentFeedbackView } from './feedback'
import { guard, invalid, isEmptyObject, isUuid, MOCK_STUDENT, MOCK_TEACHER, missing, ok, pageWindow, paginate, searchParams, segment } from './envelope'
import { randomUUID } from './random'
import type { MockHandler, MockRequestContext, MockResult } from './types'

interface StoredNotice { dto: NoticeDTO }

const fixtureTime = '2026-10-14T02:00:00Z'
const now = () => new Date().toISOString()
const notices = new Map<string, StoredNotice>()

export function resetMockDashboardState(): void {
  notices.clear()
  const id = randomUUID()
  notices.set(id, {
    dto: {
      id, offeringId: P1A_IDS.offeringWeb, title: '欢迎加入课程', content: '请先阅读第一章并完成本周作业。',
      target: null, createdAt: fixtureTime, recipientCount: 1,
    },
  })
}
resetMockDashboardState()

const knownOffering = (offeringId: string) => offeringId === P1A_IDS.offeringWeb
const feedbackOf = (offeringId: string) => publishedFeedbacks().filter(item => item.offeringId === offeringId)
const byPublishedDesc = <T extends { publishedAt: string | null; id: string }>(items: T[]) =>
  [...items].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || b.id.localeCompare(a.id))

function learningSummary(offeringId: string) {
  const feedback = feedbackOf(offeringId)
  const reviewed = new Set(feedback.map(item => item.assignmentId))
  return { completedLabCount: reviewed.size, publishedFeedbackCount: feedback.length, needsPracticeCount: null }
}

function handleDashboard(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student'])
  if (denied !== null) return denied
  const termId = searchParams(context).get('termId')
  if (termId !== null && !isUuid(termId)) return invalid(context, 'termId 不合法。', 'termId')
  const userId = mockSession()?.account.id ?? MOCK_STUDENT.id
  const pending = [...mockAssignmentStore.assignments.values()]
    .filter(item => item.dto.publicationState === 'published')
    .map(item => toSummary(item.dto, userId))
    .filter(item => item.assignmentState === 'NOT_STARTED' || item.assignmentState === 'IN_PROGRESS')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const [first, ...others] = pending
  const recent = byPublishedDesc(feedbackOf(P1A_IDS.offeringWeb))[0]
  const notice = mockMessages
    .filter(item => item.recipientId === userId && item.dto.type === 'course_notice')
    .map(item => item.dto)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const data: DashboardDTO = {
    termId: termId ?? MOCK_TERM.id, termLabel: MOCK_TERM.label, serverTime: now(), courseCount: 1,
    pendingAssignmentCount: pending.length,
    unreadMessageCount: mockMessages.filter(item => item.recipientId === userId && item.dto.readAt === null).length,
    currentLearning: first === undefined ? null : {
      type: 'assignment', offeringId: first.offeringId, chapterId: first.chapterId, assignmentId: first.id,
      title: first.title, description: first.description, assignmentType: first.type,
      assignmentState: first.assignmentState, dueAt: first.dueAt, overdue: first.overdue, resume: null,
    },
    otherPendingAssignments: others.slice(0, 2),
    recentFeedback: recent === undefined ? null : studentFeedbackView(recent),
    courses: [P1A_FIXTURES.courseSummary],
    recentNotice: notice ?? null,
  }
  return ok(context, data)
}

function handleMyLearningRecords(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student'])
  if (denied !== null) return denied
  const offeringId = segment(context, 4)
  if (!isUuid(offeringId) || !knownOffering(offeringId)) return missing(context)
  const window = pageWindow(searchParams(context))
  if (window === null) return invalid(context, '分页参数不合法。', 'query')
  const feedback = byPublishedDesc(feedbackOf(offeringId)).map(studentFeedbackView)
  const data: LearningRecordsDTO = {
    offeringId, summary: learningSummary(offeringId), recentFeedback: feedback[0] ?? null,
    feedbackPage: paginate(feedback, window), knowledgeEvidence: [], nextRecommendation: null,
  }
  return ok(context, data)
}

function handleMarkMessagesAsRead(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student'])
  if (denied !== null) return denied
  const offeringId = segment(context, 4)
  if (!isUuid(offeringId) || !knownOffering(offeringId)) return missing(context)
  if (!isEmptyObject(context.bodyJson)) return invalid(context)
  const type = searchParams(context).get('type')
  const markedAt = now()
  for (const item of mockMessages) {
    if (item.recipientId === mockSession()?.account.id && item.dto.offeringId === offeringId
      && item.dto.readAt === null && (type === null || item.dto.type === type)) item.dto.readAt = markedAt
  }
  return ok(context, { markedAt })
}

function handleListNotices(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student', 'teacher'])
  if (denied !== null) return denied
  const offeringId = segment(context, 3)
  if (!isUuid(offeringId) || !knownOffering(offeringId)) return missing(context)
  const window = pageWindow(searchParams(context))
  if (window === null) return invalid(context, '分页参数不合法。', 'query')
  const items = [...notices.values()].map(item => item.dto).filter(item => item.offeringId === offeringId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  return ok(context, paginate(items, window))
}

function handleGetNotice(context: MockRequestContext): MockResult {
  const denied = guard(context, ['student', 'teacher'])
  if (denied !== null) return denied
  const notice = notices.get(segment(context, 3))
  return notice === undefined ? missing(context) : ok(context, notice.dto)
}

function noticeWrite(value: unknown): value is NoticeWrite {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const body = value as Record<string, unknown>
  if (!Object.keys(body).every(key => ['title', 'content', 'target'].includes(key))) return false
  if (typeof body['title'] !== 'string' || body['title'].length < 1 || body['title'].length > 200) return false
  return typeof body['content'] === 'string' && body['content'].length <= 8000
}

function handleCreateNotice(context: MockRequestContext): MockResult {
  const denied = guard(context, ['teacher'])
  if (denied !== null) return denied
  const offeringId = segment(context, 4)
  if (!isUuid(offeringId) || !knownOffering(offeringId)) return missing(context)
  if (!noticeWrite(context.bodyJson)) return invalid(context)
  const body = context.bodyJson
  const dto: NoticeDTO = {
    id: randomUUID(), offeringId, title: body.title, content: body.content,
    target: body.target ?? null, createdAt: now(), recipientCount: 1,
  }
  notices.set(dto.id, { dto })
  addMockMessage({
    offeringId, type: 'course_notice', title: dto.title, content: dto.content,
    sender: { id: MOCK_TEACHER.id, displayName: MOCK_TEACHER.displayName }, createdAt: dto.createdAt, target: dto.target,
  })
  return ok(context, dto, 201)
}

function handleOfferingStats(context: MockRequestContext): MockResult {
  const denied = guard(context, ['teacher'])
  if (denied !== null) return denied
  const offeringId = segment(context, 4)
  if (!isUuid(offeringId) || !knownOffering(offeringId)) return missing(context)
  const assignments = [...mockAssignmentStore.assignments.values()].filter(item => item.dto.offeringId === offeringId)
  const pendingReviewCount = [...mockAssignmentStore.submissions.values()]
    .filter(item => item.dto.offeringId === offeringId && !item.dto.superseded && publishedFeedbackFor(item.dto.id) === null).length
  return ok(context, {
    studentCount: 1, activeAssignmentCount: assignments.filter(item => item.dto.publicationState === 'published').length,
    pendingReviewCount, pendingHelpCount: 0,
  })
}

function handleAssignmentStats(context: MockRequestContext): MockResult {
  const denied = guard(context, ['teacher'])
  if (denied !== null) return denied
  const assignmentId = segment(context, 4)
  if (!mockAssignmentStore.assignments.has(assignmentId)) return missing(context)
  const current = [...mockAssignmentStore.submissions.values()].filter(item => item.dto.assignmentId === assignmentId && !item.dto.superseded)
  const reviewed = current.filter(item => publishedFeedbackFor(item.dto.id) !== null).length
  return ok(context, {
    studentCount: 1, submittedStudentCount: current.length, pendingReviewCount: current.length - reviewed,
    reviewedStudentCount: reviewed, commonIssues: [],
  })
}

function handleStudentLearningRecords(context: MockRequestContext): MockResult {
  const denied = guard(context, ['teacher'])
  if (denied !== null) return denied
  const offeringId = segment(context, 4), studentId = segment(context, 6)
  if (!isUuid(offeringId) || !knownOffering(offeringId) || studentId !== MOCK_STUDENT.id) return missing(context)
  const window = pageWindow(searchParams(context))
  if (window === null) return invalid(context, '分页参数不合法。', 'query')
  const feedback = byPublishedDesc(feedbackOf(offeringId))
  const data: TeacherLearningRecordsDTO = {
    offeringId, summary: learningSummary(offeringId), recentFeedback: feedback[0] ?? null,
    feedbackPage: paginate(feedback, window), knowledgeEvidence: [], nextRecommendation: null,
    student: { id: MOCK_STUDENT.id, username: MOCK_STUDENT.username, displayName: MOCK_STUDENT.displayName },
  }
  return ok(context, data)
}

export const dashboardHandlers: Record<string, MockHandler> = {
  getDashboard: handleDashboard,
  getMyLearningRecords: handleMyLearningRecords,
  markMessagesAsRead: handleMarkMessagesAsRead,
  listNotices: handleListNotices,
  getNotice: handleGetNotice,
  createNotice: handleCreateNotice,
  getOfferingStats: handleOfferingStats,
  getAssignmentStats: handleAssignmentStats,
  getStudentLearningRecords: handleStudentLearningRecords,
}
