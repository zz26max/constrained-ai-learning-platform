import type { components, operations, paths } from './generated/schema'
import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'

type Schemas = components['schemas']

export type OfferingStatsDTO = Schemas['OfferingStatsDTO']
export type AssignmentStatsDTO = Schemas['AssignmentStatsDTO']
export type TeacherLearningRecordsDTO = Schemas['TeacherLearningRecordsDTO']
export type OfferingActivityDTO = Schemas['OfferingActivityDTO']
export type OfferingKnowledgeMasteryDTO = Schemas['OfferingKnowledgeMasteryDTO']

export type StudentLearningRecordsQuery = NonNullable<operations['getStudentLearningRecords']['parameters']['query']>
export type StatsRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

export type StatsOperationId = keyof Pick<operations,
  | 'getOfferingStats'
  | 'getAssignmentStats'
  | 'getStudentLearningRecords'
  | 'getOfferingActivity'
  | 'getOfferingKnowledgeMastery'
>

type StatsPayloads = { [K in StatsOperationId]: Schemas[`Response_${K}`]['data'] }
type StatsSpecs = { [K in StatsOperationId]: OperationSpec & { id: K; path: keyof paths } }

export const STATS_SPECS = {
  getOfferingStats: { id: 'getOfferingStats', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/stats', csrf: false },
  getAssignmentStats: { id: 'getAssignmentStats', method: 'GET', path: '/api/v1/teacher/assignments/{assignmentId}/stats', csrf: false },
  getStudentLearningRecords: { id: 'getStudentLearningRecords', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/students/{studentId}/learning-records', csrf: false },
  getOfferingActivity: { id: 'getOfferingActivity', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/activity', csrf: false },
  getOfferingKnowledgeMastery: { id: 'getOfferingKnowledgeMastery', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/knowledge-mastery', csrf: false },
} satisfies StatsSpecs

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class StatsApi {
  constructor(private readonly client: ApiClient) {}

  private request<K extends StatsOperationId>(
    operationId: K,
    options: StatsRequestOptions,
    ids: string[],
    query?: object
  ): Promise<ApiResult<StatsPayloads[K]>> {
    const spec = STATS_SPECS[operationId]
    let path: string = spec.path
    for (const id of ids) path = path.replace(/\{[^}]+\}/, encodeURIComponent(id))
    return this.client.request<StatsPayloads[K]>({ ...spec, path }, {
      ...options,
      ...(query === undefined ? {} : { query: queryStrings(query) }),
    })
  }

  getOfferingStats(offeringId: string, options: StatsRequestOptions = {}): Promise<ApiResult<StatsPayloads['getOfferingStats']>> {
    return this.request('getOfferingStats', options, [offeringId])
  }

  getAssignmentStats(assignmentId: string, options: StatsRequestOptions = {}): Promise<ApiResult<StatsPayloads['getAssignmentStats']>> {
    return this.request('getAssignmentStats', options, [assignmentId])
  }

  getStudentLearningRecords(offeringId: string, studentId: string, query: StudentLearningRecordsQuery = {}, options: StatsRequestOptions = {}): Promise<ApiResult<StatsPayloads['getStudentLearningRecords']>> {
    return this.request('getStudentLearningRecords', options, [offeringId, studentId], query)
  }

  getOfferingActivity(offeringId: string, options: StatsRequestOptions = {}): Promise<ApiResult<StatsPayloads['getOfferingActivity']>> {
    return this.request('getOfferingActivity', options, [offeringId])
  }

  getOfferingKnowledgeMastery(offeringId: string, options: StatsRequestOptions = {}): Promise<ApiResult<StatsPayloads['getOfferingKnowledgeMastery']>> {
    return this.request('getOfferingKnowledgeMastery', options, [offeringId])
  }
}
