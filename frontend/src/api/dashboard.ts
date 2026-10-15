import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'
import type { StudentFeedbackDTO } from './assignments'

export interface DashboardDTO {
  termId: string | null
  termLabel: string | null
  serverTime: string
  courseCount: number
  pendingAssignmentCount: number
  unreadMessageCount: number
  currentLearning: CurrentAssignment | CurrentLearningChapter | null
  otherPendingAssignments: AssignmentSummaryDTO[]
  recentFeedback: StudentFeedbackDTO | null
  courses: CourseSummaryDTO[]
  recentNotice: NotificationDTO | null
}

export interface CurrentAssignment {
  type: 'assignment'
  assignmentId: string
  title: string
  dueAt: string | null
  status: 'NOT_STARTED' | 'IN_PROGRESS'
}

export interface CurrentLearningChapter {
  type: 'chapter'
  offeringId: string
  chapterId: string
  chapterTitle: string
}

export interface AssignmentSummaryDTO {
  assignmentId: string
  title: string
  dueAt: string | null
  status: string
}

export interface CourseSummaryDTO {
  offeringId: string
  courseName: string
  offeringLabel: string
  completedCount: number
  totalCount: number
  progressUnit: 'chapter' | 'assignment'
  percent: number
}

export interface NotificationDTO {
  id: string
  title: string
  content: string
  createdAt: string
}

export interface LearningRecordsDTO {
  offeringId: string
  summary: LearningRecordSummary
  recentFeedback: StudentFeedbackDTO[]
  feedbackPage: PaginationInfo
  knowledgeEvidence: null
  nextRecommendation: null
}

export interface LearningRecordSummary {
  completedChapterCount: number
  totalChapterCount: number
  completedLabCount: number
  totalLabCount: number
  feedbackCount: number
}

export interface PaginationInfo {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export type DashboardRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

const DASHBOARD_SPECS = {
  getDashboard: { id: 'getDashboard', method: 'GET', path: '/api/v1/me/dashboard', csrf: false },
  getLearningRecords: { id: 'getLearningRecords', method: 'GET', path: '/api/v1/me/learning-records', csrf: false },
  markMessagesRead: { id: 'markMessagesRead', method: 'POST', path: '/api/v1/me/messages/read-all', csrf: true },
} as const

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class DashboardApi {
  constructor(private readonly client: ApiClient) {}

  getDashboard(termId?: string, options: DashboardRequestOptions = {}): Promise<ApiResult<DashboardDTO>> {
    const spec = DASHBOARD_SPECS.getDashboard
    return this.client.request<DashboardDTO>(spec as OperationSpec, {
      ...options,
      query: termId ? queryStrings({ termId }) : undefined,
    })
  }

  getLearningRecords(
    offeringId: string,
    page = 1,
    pageSize = 20,
    options: DashboardRequestOptions = {}
  ): Promise<ApiResult<LearningRecordsDTO>> {
    const spec = DASHBOARD_SPECS.getLearningRecords
    return this.client.request<LearningRecordsDTO>(spec as OperationSpec, {
      ...options,
      query: queryStrings({ offeringId, page, pageSize }),
    })
  }

  markMessagesRead(
    offeringId?: string,
    type?: string,
    options: DashboardRequestOptions = {}
  ): Promise<ApiResult<void>> {
    const spec = DASHBOARD_SPECS.markMessagesRead
    return this.client.request<void>(spec as OperationSpec, {
      ...options,
      query: queryStrings({ offeringId, type }),
    })
  }
}
