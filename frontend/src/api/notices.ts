import type { components, operations, paths } from './generated/schema'
import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'

type Schemas = components['schemas']

export type NoticeDTO = Schemas['NoticeDTO']
export type NoticePage = Schemas['NoticePage']
export type NoticeWrite = Schemas['NoticeWrite']
export type TargetDTO = Schemas['TargetDTO']

export type NoticesQuery = NonNullable<operations['listNotices']['parameters']['query']>
export type NoticeRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

export type NoticeOperationId = keyof Pick<operations,
  | 'listNotices'
  | 'getNotice'
  | 'createNotice'
>

type NoticePayloads = { [K in NoticeOperationId]: Schemas[`Response_${K}`]['data'] }
type NoticeSpecs = { [K in NoticeOperationId]: OperationSpec & { id: K; path: keyof paths } }

export const NOTICE_SPECS = {
  listNotices: { id: 'listNotices', method: 'GET', path: '/api/v1/offerings/{offeringId}/notices', csrf: false },
  getNotice: { id: 'getNotice', method: 'GET', path: '/api/v1/notices/{noticeId}', csrf: false },
  createNotice: { id: 'createNotice', method: 'POST', path: '/api/v1/teacher/offerings/{offeringId}/notices', csrf: true },
} satisfies NoticeSpecs

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class NoticesApi {
  constructor(private readonly client: ApiClient) {}

  private request<K extends NoticeOperationId>(
    operationId: K,
    options: NoticeRequestOptions,
    id: string,
    body?: unknown,
    query?: object
  ): Promise<ApiResult<NoticePayloads[K]>> {
    const spec = NOTICE_SPECS[operationId]
    const path = spec.path.replace(/\{[^}]+\}/, encodeURIComponent(id))
    return this.client.request<NoticePayloads[K]>({ ...spec, path }, {
      ...options,
      ...(body === undefined ? {} : { body }),
      ...(query === undefined ? {} : { query: queryStrings(query) }),
    })
  }

  listNotices(offeringId: string, query: NoticesQuery = {}, options: NoticeRequestOptions = {}): Promise<ApiResult<NoticePayloads['listNotices']>> {
    return this.request('listNotices', options, offeringId, undefined, query)
  }

  getNotice(noticeId: string, options: NoticeRequestOptions = {}): Promise<ApiResult<NoticePayloads['getNotice']>> {
    return this.request('getNotice', options, noticeId)
  }

  createNotice(offeringId: string, body: NoticeWrite, options: NoticeRequestOptions = {}): Promise<ApiResult<NoticePayloads['createNotice']>> {
    return this.request('createNotice', options, offeringId, body)
  }
}
