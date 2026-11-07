import type { components, operations, paths } from './generated/schema'
import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'

type Schemas = components['schemas']

export type AssignmentSummaryDTO = Schemas['AssignmentSummaryDTO']
export type AssignmentDetailDTO = Schemas['AssignmentDetailDTO']
export type CheckDTO = Schemas['CheckDTO']
export type CheckPolicyConfig = Schemas['CheckPolicyConfig']
export type CheckPolicyWrite = NonNullable<operations['updateCheckPolicy']['requestBody']>['content']['application/json']
export type WorkspaceDTO = Schemas['WorkspaceDTO']
export type TeacherAssignmentDTO = Schemas['TeacherAssignmentDTO']
export type AssignmentWriteDTO = Schemas['AssignmentWriteDTO']
export type AssignmentPatch = Schemas['AssignmentPatch']
export type WorkspaceWrite = Schemas['WorkspaceWrite']
export type SubmissionWrite = Schemas['SubmissionWrite']
export type SubmissionSummaryDTO = Schemas['SubmissionSummaryDTO']
export type SubmissionDetailDTO = Schemas['SubmissionDetailDTO']
export type TeacherSubmissionDetailDTO = Schemas['TeacherSubmissionDetailDTO']
export type AssignmentSnapshot = Schemas['AssignmentSnapshot']
export type TeacherFeedbackDTO = Schemas['TeacherFeedbackDTO']
export type StudentFeedbackDTO = Schemas['StudentFeedbackDTO']
export type RubricResult = Schemas['RubricResult']
export type FeedbackWrite = Schemas['FeedbackWrite']
export type NotificationDTO = Schemas['NotificationDTO']

export type MyAssignmentsQuery = NonNullable<operations['listMyAssignments']['parameters']['query']>
export type TeacherAssignmentsQuery = NonNullable<operations['listTeacherAssignments']['parameters']['query']>
export type AssignmentRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

export type AssignmentOperationId = keyof Pick<operations,
  | 'listMyAssignments'
  | 'getAssignment'
  | 'getCheckPolicy'
  | 'updateCheckPolicy'
  | 'getAssignmentCheck'
  | 'createCheck'
  | 'getCheck'
  | 'getWorkspace'
  | 'saveWorkspace'
  | 'submitAssignment'
  | 'listMySubmissions'
  | 'getSubmission'
  | 'listTeacherAssignments'
  | 'listTeacherSubmissions'
  | 'createAssignment'
  | 'getTeacherAssignment'
  | 'patchAssignment'
  | 'publishAssignment'
  | 'archiveAssignment'
  | 'getFeedbackDraft'
  | 'saveFeedback'
  | 'publishFeedback'
  | 'getFeedback'
  | 'listMessages'
  | 'readMessage'
>

type CheckPayloads = {
  getCheckPolicy: Schemas['Response_CheckPolicy']['data']
  updateCheckPolicy: Schemas['Response_CheckPolicy']['data']
  getAssignmentCheck: Schemas['Response_AssignmentCheck']['data']
}
type AssignmentPayloads = CheckPayloads & {
  [K in Exclude<AssignmentOperationId, keyof CheckPayloads>]: Schemas[`Response_${K}`]['data']
}
type AssignmentSpecs = { [K in AssignmentOperationId]: OperationSpec & { id: K; path: keyof paths } }

export const ASSIGNMENT_SPECS = {
  listMyAssignments: { id: 'listMyAssignments', method: 'GET', path: '/api/v1/me/assignments', csrf: false },
  getAssignment: { id: 'getAssignment', method: 'GET', path: '/api/v1/assignments/{assignmentId}', csrf: false },
  getCheckPolicy: { id: 'getCheckPolicy', method: 'GET', path: '/api/v1/teacher/assignments/{assignmentId}/check-policy', csrf: false },
  updateCheckPolicy: { id: 'updateCheckPolicy', method: 'PUT', path: '/api/v1/teacher/assignments/{assignmentId}/check-policy', csrf: true },
  getAssignmentCheck: { id: 'getAssignmentCheck', method: 'GET', path: '/api/v1/assignments/{assignmentId}/checks', csrf: false },
  createCheck: { id: 'createCheck', method: 'POST', path: '/api/v1/assignments/{assignmentId}/checks', csrf: true },
  getCheck: { id: 'getCheck', method: 'GET', path: '/api/v1/checks/{checkId}', csrf: false },
  getWorkspace: { id: 'getWorkspace', method: 'GET', path: '/api/v1/assignments/{assignmentId}/workspace', csrf: false },
  saveWorkspace: { id: 'saveWorkspace', method: 'PUT', path: '/api/v1/assignments/{assignmentId}/workspace', csrf: true },
  submitAssignment: { id: 'submitAssignment', method: 'POST', path: '/api/v1/assignments/{assignmentId}/submissions', csrf: true },
  listMySubmissions: { id: 'listMySubmissions', method: 'GET', path: '/api/v1/assignments/{assignmentId}/submissions', csrf: false },
  getSubmission: { id: 'getSubmission', method: 'GET', path: '/api/v1/submissions/{submissionId}', csrf: false },
  listTeacherAssignments: { id: 'listTeacherAssignments', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/assignments', csrf: false },
  listTeacherSubmissions: { id: 'listTeacherSubmissions', method: 'GET', path: '/api/v1/teacher/assignments/{assignmentId}/submissions', csrf: false },
  createAssignment: { id: 'createAssignment', method: 'POST', path: '/api/v1/teacher/offerings/{offeringId}/assignments', csrf: true },
  getTeacherAssignment: { id: 'getTeacherAssignment', method: 'GET', path: '/api/v1/teacher/assignments/{assignmentId}', csrf: false },
  patchAssignment: { id: 'patchAssignment', method: 'PATCH', path: '/api/v1/teacher/assignments/{assignmentId}', csrf: true },
  publishAssignment: { id: 'publishAssignment', method: 'POST', path: '/api/v1/teacher/assignments/{assignmentId}/publish', csrf: true },
  archiveAssignment: { id: 'archiveAssignment', method: 'POST', path: '/api/v1/teacher/assignments/{assignmentId}/archive', csrf: true },
  getFeedbackDraft: { id: 'getFeedbackDraft', method: 'GET', path: '/api/v1/teacher/submissions/{submissionId}/feedback', csrf: false },
  saveFeedback: { id: 'saveFeedback', method: 'POST', path: '/api/v1/teacher/submissions/{submissionId}/feedback', csrf: true },
  publishFeedback: { id: 'publishFeedback', method: 'POST', path: '/api/v1/teacher/submissions/{submissionId}/feedback/publish', csrf: true },
  getFeedback: { id: 'getFeedback', method: 'GET', path: '/api/v1/me/feedback/{feedbackId}', csrf: false },
  listMessages: { id: 'listMessages', method: 'GET', path: '/api/v1/me/messages', csrf: false },
  readMessage: { id: 'readMessage', method: 'PUT', path: '/api/v1/me/messages/{messageId}/read', csrf: true },
} satisfies AssignmentSpecs

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class AssignmentsApi {
  constructor(private readonly client: ApiClient) {}

  private request<K extends AssignmentOperationId>(
    operationId: K,
    options: AssignmentRequestOptions,
    id?: string,
    body?: unknown,
    query?: object
  ): Promise<ApiResult<AssignmentPayloads[K]>> {
    const spec = ASSIGNMENT_SPECS[operationId]
    const path = id === undefined ? spec.path : spec.path.replace(/\{[^}]+\}/, encodeURIComponent(id))
    return this.client.request<AssignmentPayloads[K]>({ ...spec, path }, {
      ...options,
      ...(body === undefined ? {} : { body }),
      ...(query === undefined ? {} : { query: queryStrings(query) }),
    })
  }

  listMyAssignments(query: MyAssignmentsQuery = {}, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['listMyAssignments']>> {
    return this.request('listMyAssignments', options, undefined, undefined, query)
  }

  getAssignment(id: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['getAssignment']>> {
    return this.request('getAssignment', options, id)
  }

  getCheckPolicy(id: string, options: AssignmentRequestOptions = {}) {
    return this.request('getCheckPolicy', options, id)
  }

  updateCheckPolicy(id: string, body: CheckPolicyWrite, options: AssignmentRequestOptions = {}) {
    return this.request('updateCheckPolicy', options, id, body)
  }

  getAssignmentCheck(id: string, workspaceRevision: number, options: AssignmentRequestOptions = {}) {
    return this.request('getAssignmentCheck', options, id, undefined, { workspaceRevision })
  }

  createCheck(id: string, workspaceRevision: number, options: AssignmentRequestOptions = {}) {
    return this.request('createCheck', options, id, { workspaceRevision })
  }

  getCheck(id: string, options: AssignmentRequestOptions = {}) {
    return this.request('getCheck', options, id)
  }

  getWorkspace(id: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['getWorkspace']>> {
    return this.request('getWorkspace', options, id)
  }

  saveWorkspace(id: string, body: WorkspaceWrite, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['saveWorkspace']>> {
    return this.request('saveWorkspace', options, id, body)
  }

  submitAssignment(id: string, body: SubmissionWrite, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['submitAssignment']>> {
    return this.request('submitAssignment', options, id, body)
  }

  listMySubmissions(id: string, query: { page?: number; pageSize?: number } = {}, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['listMySubmissions']>> {
    return this.request('listMySubmissions', options, id, undefined, query)
  }

  getSubmission(id: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['getSubmission']>> {
    return this.request('getSubmission', options, id)
  }
  listTeacherSubmissions(id: string, query: NonNullable<operations['listTeacherSubmissions']['parameters']['query']> = {}, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['listTeacherSubmissions']>> {
    return this.request('listTeacherSubmissions', options, id, undefined, query)
  }

  listTeacherAssignments(offeringId: string, query: TeacherAssignmentsQuery = {}, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['listTeacherAssignments']>> {
    return this.request('listTeacherAssignments', options, offeringId, undefined, query)
  }

  createAssignment(offeringId: string, body: AssignmentWriteDTO, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['createAssignment']>> {
    return this.request('createAssignment', options, offeringId, body)
  }

  getTeacherAssignment(id: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['getTeacherAssignment']>> {
    return this.request('getTeacherAssignment', options, id)
  }

  patchAssignment(id: string, body: AssignmentPatch, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['patchAssignment']>> {
    return this.request('patchAssignment', options, id, body)
  }

  publishAssignment(id: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['publishAssignment']>> {
    return this.request('publishAssignment', options, id, {})
  }

  archiveAssignment(id: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['archiveAssignment']>> {
    return this.request('archiveAssignment', options, id, {})
  }

  getFeedbackDraft(submissionId: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['getFeedbackDraft']>> {
    return this.request('getFeedbackDraft', options, submissionId)
  }

  saveFeedback(submissionId: string, body: FeedbackWrite, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['saveFeedback']>> {
    return this.request('saveFeedback', options, submissionId, body)
  }

  publishFeedback(submissionId: string, body: { baseVersion: number }, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['publishFeedback']>> {
    return this.request('publishFeedback', options, submissionId, body)
  }

  getFeedback(feedbackId: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['getFeedback']>> {
    return this.request('getFeedback', options, feedbackId)
  }

  listMessages(query: NonNullable<operations['listMessages']['parameters']['query']> = {}, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['listMessages']>> {
    return this.request('listMessages', options, undefined, undefined, query)
  }

  readMessage(messageId: string, options: AssignmentRequestOptions = {}): Promise<ApiResult<AssignmentPayloads['readMessage']>> {
    return this.request('readMessage', options, messageId, {})
  }
}
