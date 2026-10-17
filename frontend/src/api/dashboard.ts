import type { components, operations, paths } from './generated/schema'
import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'

type Schemas = components['schemas']

export type DashboardDTO = Schemas['DashboardDTO']
export type LearningRecordsDTO = Schemas['LearningRecordsDTO']
export type MarkedReadDTO = Schemas['MarkedReadDTO']

export type DashboardQuery = NonNullable<operations['getDashboard']['parameters']['query']>
export type LearningRecordsQuery = NonNullable<operations['getMyLearningRecords']['parameters']['query']>
export type MarkMessagesQuery = NonNullable<operations['markMessagesAsRead']['parameters']['query']>
export type DashboardRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

export type DashboardOperationId = keyof Pick<operations,
  | 'getDashboard'
  | 'getMyLearningRecords'
  | 'markMessagesAsRead'
>

type DashboardPayloads = { [K in DashboardOperationId]: Schemas[`Response_${K}`]['data'] }
type DashboardSpecs = { [K in DashboardOperationId]: OperationSpec & { id: K; path: keyof paths } }

export const DASHBOARD_SPECS = {
  getDashboard: { id: 'getDashboard', method: 'GET', path: '/api/v1/me/dashboard', csrf: false },
  getMyLearningRecords: { id: 'getMyLearningRecords', method: 'GET', path: '/api/v1/me/offerings/{offeringId}/learning-records', csrf: false },
  markMessagesAsRead: { id: 'markMessagesAsRead', method: 'PUT', path: '/api/v1/me/offerings/{offeringId}/messages/mark-read', csrf: true },
} satisfies DashboardSpecs

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class DashboardApi {
  constructor(private readonly client: ApiClient) {}

  private request<K extends DashboardOperationId>(
    operationId: K,
    options: DashboardRequestOptions,
    id?: string,
    body?: unknown,
    query?: object
  ): Promise<ApiResult<DashboardPayloads[K]>> {
    const spec = DASHBOARD_SPECS[operationId]
    const path = id === undefined ? spec.path : spec.path.replace(/\{[^}]+\}/, encodeURIComponent(id))
    return this.client.request<DashboardPayloads[K]>({ ...spec, path }, {
      ...options,
      ...(body === undefined ? {} : { body }),
      ...(query === undefined ? {} : { query: queryStrings(query) }),
    })
  }

  getDashboard(query: DashboardQuery = {}, options: DashboardRequestOptions = {}): Promise<ApiResult<DashboardPayloads['getDashboard']>> {
    return this.request('getDashboard', options, undefined, undefined, query)
  }

  getMyLearningRecords(offeringId: string, query: LearningRecordsQuery = {}, options: DashboardRequestOptions = {}): Promise<ApiResult<DashboardPayloads['getMyLearningRecords']>> {
    return this.request('getMyLearningRecords', options, offeringId, undefined, query)
  }

  markMessagesAsRead(offeringId: string, query: MarkMessagesQuery = {}, options: DashboardRequestOptions = {}): Promise<ApiResult<DashboardPayloads['markMessagesAsRead']>> {
    return this.request('markMessagesAsRead', options, offeringId, {}, query)
  }
}
