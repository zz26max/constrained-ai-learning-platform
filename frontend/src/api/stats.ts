import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'
import type { LearningRecordsDTO } from './dashboard'

export interface OfferingStatsDTO {
  studentCount: number
  activeAssignmentCount: number
  pendingReviewCount: number
  pendingHelpCount: number
}

export interface AssignmentStatsDTO {
  submittedStudentCount: number
  pendingReviewCount: number
  avgScore: number | null
}

export type StatsRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

const STATS_SPECS = {
  getOfferingStats: { id: 'getOfferingStats', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/stats', csrf: false },
  getAssignmentStats: { id: 'getAssignmentStats', method: 'GET', path: '/api/v1/teacher/assignments/{assignmentId}/stats', csrf: false },
  getStudentLearningRecords: { id: 'getStudentLearningRecords', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/students/{studentId}/learning-records', csrf: false },
} as const

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class StatsApi {
  constructor(private readonly client: ApiClient) {}

  getOfferingStats(
    offeringId: string,
    options: StatsRequestOptions = {}
  ): Promise<ApiResult<OfferingStatsDTO>> {
    const spec = STATS_SPECS.getOfferingStats
    const path = spec.path.replace('{offeringId}', encodeURIComponent(offeringId))
    return this.client.request<OfferingStatsDTO>({ ...spec, path } as OperationSpec, options)
  }

  getAssignmentStats(
    assignmentId: string,
    options: StatsRequestOptions = {}
  ): Promise<ApiResult<AssignmentStatsDTO>> {
    const spec = STATS_SPECS.getAssignmentStats
    const path = spec.path.replace('{assignmentId}', encodeURIComponent(assignmentId))
    return this.client.request<AssignmentStatsDTO>({ ...spec, path } as OperationSpec, options)
  }

  getStudentLearningRecords(
    offeringId: string,
    studentId: string,
    page = 1,
    pageSize = 20,
    options: StatsRequestOptions = {}
  ): Promise<ApiResult<LearningRecordsDTO>> {
    const spec = STATS_SPECS.getStudentLearningRecords
    const path = spec.path
      .replace('{offeringId}', encodeURIComponent(offeringId))
      .replace('{studentId}', encodeURIComponent(studentId))
    return this.client.request<LearningRecordsDTO>({ ...spec, path } as OperationSpec, {
      ...options,
      query: queryStrings({ page, pageSize }),
    })
  }
}
