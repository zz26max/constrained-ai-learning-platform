import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'

export interface NoticeDTO {
  id: string
  offeringId: string
  authorId: string
  authorName: string
  targetStudentId: string | null
  targetStudentName: string | null
  title: string
  content: string
  createdAt: string
}

export interface NoticeWrite {
  targetStudentId?: string | null
  title: string
  content: string
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export type NoticeRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

const NOTICE_SPECS = {
  listNotices: { id: 'listNotices', method: 'GET', path: '/api/v1/offerings/{offeringId}/notices', csrf: false },
  getNotice: { id: 'getNotice', method: 'GET', path: '/api/v1/notices/{noticeId}', csrf: false },
  createNotice: { id: 'createNotice', method: 'POST', path: '/api/v1/teacher/offerings/{offeringId}/notices', csrf: true },
  listTeacherNotices: { id: 'listTeacherNotices', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/notices', csrf: false },
} as const

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class NoticesApi {
  constructor(private readonly client: ApiClient) {}

  listNotices(
    offeringId: string,
    page = 1,
    pageSize = 20,
    options: NoticeRequestOptions = {}
  ): Promise<ApiResult<Page<NoticeDTO>>> {
    const spec = NOTICE_SPECS.listNotices
    const path = spec.path.replace('{offeringId}', encodeURIComponent(offeringId))
    return this.client.request<Page<NoticeDTO>>({ ...spec, path } as OperationSpec, {
      ...options,
      query: queryStrings({ page, pageSize }),
    })
  }

  getNotice(noticeId: string, options: NoticeRequestOptions = {}): Promise<ApiResult<NoticeDTO>> {
    const spec = NOTICE_SPECS.getNotice
    const path = spec.path.replace('{noticeId}', encodeURIComponent(noticeId))
    return this.client.request<NoticeDTO>({ ...spec, path } as OperationSpec, options)
  }

  createNotice(
    offeringId: string,
    input: NoticeWrite,
    options: NoticeRequestOptions = {}
  ): Promise<ApiResult<NoticeDTO>> {
    const spec = NOTICE_SPECS.createNotice
    const path = spec.path.replace('{offeringId}', encodeURIComponent(offeringId))
    return this.client.request<NoticeDTO>({ ...spec, path } as OperationSpec, {
      ...options,
      body: input,
    })
  }

  listTeacherNotices(
    offeringId: string,
    page = 1,
    pageSize = 20,
    options: NoticeRequestOptions = {}
  ): Promise<ApiResult<Page<NoticeDTO>>> {
    const spec = NOTICE_SPECS.listTeacherNotices
    const path = spec.path.replace('{offeringId}', encodeURIComponent(offeringId))
    return this.client.request<Page<NoticeDTO>>({ ...spec, path } as OperationSpec, {
      ...options,
      query: queryStrings({ page, pageSize }),
    })
  }
}
