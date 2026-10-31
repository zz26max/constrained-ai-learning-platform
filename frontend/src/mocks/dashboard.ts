import type { DashboardDTO, LearningRecordsDTO } from '../api/dashboard'
import type { NoticeDTO, NoticeWrite } from '../api/notices'
import type { OfferingActivityDTO, OfferingKnowledgeMasteryDTO, TeacherLearningRecordsDTO } from '../api/stats'
import { MOCK_TERM, mockSession } from './auth'
import { P1A_FIXTURES, P1A_IDS, isMember } from './courses'
import { mockAssignmentStore, toSummary } from './assignments'
import { publishedFeedbackFor, publishedFeedbacks, studentFeedbackView } from './feedback'
import { addMockMessage, mockMessages } from './message-store'
import { guard, invalid, isEmptyObject, isUuid, MOCK_STUDENT, MOCK_TEACHER, missing, ok, pageWindow, paginate, searchParams, segment } from './envelope'
import { randomUUID } from './random'
import { ISSUE_TAGS } from './tutoring'
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

const knownOffering = (offeringId: string) => offeringId === P1A_IDS.offeringWeb || offeringId === P1A_IDS.offeringPersonal
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
    .filter(item => item.dto.publicationState === 'published' && isMember(item.dto.offeringId, userId, 'student'))
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
  if (!noticeTargetValid(body['target'])) return false
  return typeof body['content'] === 'string' && body['content'].length <= 8000
}

/** 与真实后端对齐（契约 1.1.1）：全班公告 target 禁止 feedback，help_request 在 P1 同样拒绝。 */
function noticeTargetValid(target: unknown): boolean {
  if (target === undefined || target === null) return true
  if (typeof target !== 'object' || Array.isArray(target)) return false
  const record = target as Record<string, unknown>
  if (!Object.keys(record).every(key => ['type', 'id', 'offeringId'].includes(key))) return false
  if (typeof record['type'] !== 'string' || typeof record['id'] !== 'string' || typeof record['offeringId'] !== 'string') return false
  return record['type'] !== 'feedback' && record['type'] !== 'help_request'
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
  const feedback = current.map(item => publishedFeedbackFor(item.dto.id)).filter(item => item !== null)
  const reviewed = feedback.length
  // 常见问题按当前词表汇总已发布评价的问题标签；mock 没有学生求助来源。
  const issues = ISSUE_TAGS.items.flatMap(tag => {
    const tagged = feedback.filter(item => item.issueTags.includes(tag.tag))
    if (tagged.length === 0) return []
    const times = tagged.map(item => item.publishedAt ?? fixtureTime).sort()
    return [{
      issueTag: tag.tag, title: tag.title, reportedStudentCount: 0, confirmedStudentCount: tagged.length,
      distinctStudentCount: tagged.length, description: tag.description, sources: ['teacher_feedback'],
      timeRange: { from: times[0]!, to: times[times.length - 1]! }, knowledgePointId: null,
    }]
  })
  return ok(context, {
    studentCount: 1, submittedStudentCount: current.length, pendingReviewCount: current.length - reviewed,
    reviewedStudentCount: reviewed, commonIssues: issues,
  })
}

type MockActivityDay = OfferingActivityDTO['days'][number]

/** mock 固定夹具：最近 14 天仅末三天有行为，用于界面预览。 */
function mockActivityDays(): MockActivityDay[] {
  const labels = Array.from({ length: 14 }, (_, index) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() - (13 - index) * 86_400_000)))
  const empty = (date: string): MockActivityDay => ({
    date, activeStudentCount: 0, chapterOpenedCount: 0, resourceOpenedCount: 0, editorOpenedCount: 0,
    previewOpenedCount: 0, workspaceSavedCount: 0, assignmentSubmittedCount: 0, helpRequestCreatedCount: 0,
    tutoringCompletedCount: 0,
  })
  const days = labels.map(empty)
  days[11] = { ...empty(labels[11]!), activeStudentCount: 1, chapterOpenedCount: 2, resourceOpenedCount: 1 }
  days[12] = {
    ...empty(labels[12]!), activeStudentCount: 1, chapterOpenedCount: 1, editorOpenedCount: 1,
    workspaceSavedCount: 2, assignmentSubmittedCount: 1, helpRequestCreatedCount: 1, tutoringCompletedCount: 1,
  }
  days[13] = {
    ...empty(labels[13]!), activeStudentCount: 1, chapterOpenedCount: 3, resourceOpenedCount: 1,
    editorOpenedCount: 2, previewOpenedCount: 1, workspaceSavedCount: 2, tutoringCompletedCount: 1,
  }
  return days
}

function handleOfferingActivity(context: MockRequestContext): MockResult {
  const denied = guard(context, ['teacher'])
  if (denied !== null) return denied
  const offeringId = segment(context, 4)
  if (!isUuid(offeringId) || !knownOffering(offeringId)) return missing(context)
  const days = mockActivityDays()
  const total = (field: keyof OfferingActivityDTO['totals']) => days.reduce((sum, day) => sum + day[field], 0)
  return ok(context, {
    offeringId, from: days[0]!.date, to: days[days.length - 1]!.date, days,
    totals: {
      activeStudentCount: days.some(day => day.activeStudentCount > 0) ? 1 : 0,
      chapterOpenedCount: total('chapterOpenedCount'),
      resourceOpenedCount: total('resourceOpenedCount'), editorOpenedCount: total('editorOpenedCount'),
      previewOpenedCount: total('previewOpenedCount'), workspaceSavedCount: total('workspaceSavedCount'),
      assignmentSubmittedCount: total('assignmentSubmittedCount'), helpRequestCreatedCount: total('helpRequestCreatedCount'),
      tutoringCompletedCount: total('tutoringCompletedCount'),
    },
  })
}

function handleOfferingKnowledgeMastery(context: MockRequestContext): MockResult {
  const denied = guard(context, ['teacher'])
  if (denied !== null) return denied
  const offeringId = segment(context, 4)
  if (!isUuid(offeringId) || !knownOffering(offeringId)) return missing(context)
  const point = P1A_FIXTURES.knowledgePoint
  // mock 固定夹具：单学生单知识点已基本掌握，用于界面预览。
  const distribution = { basicallyMastered: 1, needsPractice: 0, learning: 0, insufficientEvidence: 0 }
  const data: OfferingKnowledgeMasteryDTO = {
    offeringId, ruleVersion: 'knowledge-v2', asOf: now(), studentCount: 1, assessedStudentCount: 1, knowledgePointCount: 1,
    summary: { assessmentCount: 1, distribution, masteryRate: 1 },
    items: [{
      knowledgePointId: point.id, title: point.title, chapterId: point.chapterId, studentCount: 1, assessedStudentCount: 1,
      distribution, masteryRate: 1,
    }],
  }
  return ok(context, data)
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
  getOfferingActivity: handleOfferingActivity,
  getOfferingKnowledgeMastery: handleOfferingKnowledgeMastery,
}
