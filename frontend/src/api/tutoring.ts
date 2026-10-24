import type { components, operations, paths } from './generated/schema'
import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'

type Schemas = components['schemas']

export type AiPolicyDTO = Schemas['AiPolicyDTO']
export type AiPolicyWriteDTO = Schemas['AiPolicyWriteDTO']
export type IssueTagsDTO = Schemas['IssueTagsDTO']
export type TutoringSessionDTO = Schemas['TutoringSessionDTO']
export type TutoringSessionCreatedDTO = Schemas['TutoringSessionCreatedDTO']
export type TutoringSessionWrite = Schemas['TutoringSessionWrite']
export type TutoringMessageDTO = Schemas['TutoringMessageDTO']
export type TutoringMessagePage = Schemas['TutoringMessagePage']
export type TutoringWrite = Schemas['TutoringWrite']
export type TutoringAcceptedDTO = Schemas['TutoringAcceptedDTO']
export type TutoringRequestDTO = Schemas['TutoringRequestDTO']
export type TutoringResult = Schemas['TutoringResult']
export type TaskError = Schemas['TaskError']
export type HelpRequestDTO = Schemas['HelpRequestDTO']
export type HelpRequestDetailDTO = Schemas['HelpRequestDetailDTO']
export type HelpRequestWrite = Schemas['HelpRequestWrite']
export type HelpReplyDTO = Schemas['HelpReplyDTO']
export type HelpReplyWrite = Schemas['HelpReplyWrite']
export type HelpReplyCreatedDTO = Schemas['HelpReplyCreatedDTO']
export type HelpStatusWrite = Schemas['HelpStatusWrite']
export type TeacherHelpRequestDTO = Schemas['TeacherHelpRequestDTO']
export type TeacherHelpRequestDetailDTO = Schemas['TeacherHelpRequestDetailDTO']
export type LearningEventsWrite = Schemas['LearningEventsWrite']
export type LearningEventsDTO = Schemas['LearningEventsDTO']
export type HintAction = Schemas['HintAction']

export type TutoringRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

export type TutoringOperationId = keyof Pick<operations,
  | 'getAiPolicy'
  | 'getTeacherAiPolicy'
  | 'updateAiPolicy'
  | 'getIssueTags'
  | 'listTutoringSessions'
  | 'createTutoringSession'
  | 'listTutoringMessages'
  | 'sendTutoringMessage'
  | 'getTutoringRequest'
  | 'createHelpRequest'
  | 'listHelpRequests'
  | 'getHelpRequest'
  | 'listTeacherHelpRequests'
  | 'getTeacherHelpRequest'
  | 'replyToHelpRequest'
  | 'closeHelpRequest'
  | 'recordLearningEvents'
>

type TutoringPayloads = { [K in TutoringOperationId]: Schemas[`Response_${K}`]['data'] }
type TutoringSpecs = { [K in TutoringOperationId]: OperationSpec & { id: K; path: keyof paths } }

export const TUTORING_SPECS = {
  getAiPolicy: { id: 'getAiPolicy', method: 'GET', path: '/api/v1/assignments/{assignmentId}/ai-policy', csrf: false },
  getTeacherAiPolicy: { id: 'getTeacherAiPolicy', method: 'GET', path: '/api/v1/teacher/assignments/{assignmentId}/ai-policy', csrf: false },
  updateAiPolicy: { id: 'updateAiPolicy', method: 'PUT', path: '/api/v1/teacher/assignments/{assignmentId}/ai-policy', csrf: true },
  getIssueTags: { id: 'getIssueTags', method: 'GET', path: '/api/v1/offerings/{offeringId}/issue-tags', csrf: false },
  listTutoringSessions: { id: 'listTutoringSessions', method: 'GET', path: '/api/v1/assignments/{assignmentId}/tutoring-sessions', csrf: false },
  createTutoringSession: { id: 'createTutoringSession', method: 'POST', path: '/api/v1/tutoring/sessions', csrf: true },
  listTutoringMessages: { id: 'listTutoringMessages', method: 'GET', path: '/api/v1/tutoring/sessions/{sessionId}/messages', csrf: false },
  sendTutoringMessage: { id: 'sendTutoringMessage', method: 'POST', path: '/api/v1/tutoring/sessions/{sessionId}/messages', csrf: true },
  getTutoringRequest: { id: 'getTutoringRequest', method: 'GET', path: '/api/v1/tutoring/requests/{tutoringRequestId}', csrf: false },
  createHelpRequest: { id: 'createHelpRequest', method: 'POST', path: '/api/v1/me/help-requests', csrf: true },
  listHelpRequests: { id: 'listHelpRequests', method: 'GET', path: '/api/v1/me/help-requests', csrf: false },
  getHelpRequest: { id: 'getHelpRequest', method: 'GET', path: '/api/v1/me/help-requests/{helpRequestId}', csrf: false },
  listTeacherHelpRequests: { id: 'listTeacherHelpRequests', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/help-requests', csrf: false },
  getTeacherHelpRequest: { id: 'getTeacherHelpRequest', method: 'GET', path: '/api/v1/teacher/help-requests/{helpRequestId}', csrf: false },
  replyToHelpRequest: { id: 'replyToHelpRequest', method: 'POST', path: '/api/v1/teacher/help-requests/{helpRequestId}/replies', csrf: true },
  closeHelpRequest: { id: 'closeHelpRequest', method: 'PUT', path: '/api/v1/teacher/help-requests/{helpRequestId}/status', csrf: true },
  recordLearningEvents: { id: 'recordLearningEvents', method: 'POST', path: '/api/v1/me/learning-events', csrf: true },
} satisfies TutoringSpecs

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class TutoringApi {
  constructor(private readonly client: ApiClient) {}

  private request<K extends TutoringOperationId>(
    operationId: K,
    options: TutoringRequestOptions,
    id?: string,
    body?: unknown,
    query?: object
  ): Promise<ApiResult<TutoringPayloads[K]>> {
    const spec = TUTORING_SPECS[operationId]
    const path = id === undefined ? spec.path : spec.path.replace(/\{[^}]+\}/, encodeURIComponent(id))
    return this.client.request<TutoringPayloads[K]>({ ...spec, path }, {
      ...options,
      ...(body === undefined ? {} : { body }),
      ...(query === undefined ? {} : { query: queryStrings(query) }),
    })
  }

  getAiPolicy(assignmentId: string, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['getAiPolicy']>> {
    return this.request('getAiPolicy', options, assignmentId)
  }

  getTeacherAiPolicy(assignmentId: string, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['getTeacherAiPolicy']>> {
    return this.request('getTeacherAiPolicy', options, assignmentId)
  }

  updateAiPolicy(assignmentId: string, body: AiPolicyWriteDTO, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['updateAiPolicy']>> {
    return this.request('updateAiPolicy', options, assignmentId, body)
  }

  getIssueTags(offeringId: string, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['getIssueTags']>> {
    return this.request('getIssueTags', options, offeringId)
  }

  listTutoringSessions(assignmentId: string, query: { page?: number; pageSize?: number } = {}, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['listTutoringSessions']>> {
    return this.request('listTutoringSessions', options, assignmentId, undefined, query)
  }

  createTutoringSession(body: TutoringSessionWrite, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['createTutoringSession']>> {
    return this.request('createTutoringSession', options, undefined, body)
  }

  listTutoringMessages(sessionId: string, query: { page?: number; pageSize?: number } = {}, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['listTutoringMessages']>> {
    return this.request('listTutoringMessages', options, sessionId, undefined, query)
  }

  sendTutoringMessage(sessionId: string, body: TutoringWrite, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['sendTutoringMessage']>> {
    return this.request('sendTutoringMessage', options, sessionId, body)
  }

  getTutoringRequest(tutoringRequestId: string, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['getTutoringRequest']>> {
    return this.request('getTutoringRequest', options, tutoringRequestId)
  }

  createHelpRequest(body: HelpRequestWrite, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['createHelpRequest']>> {
    return this.request('createHelpRequest', options, undefined, body)
  }

  listHelpRequests(query: { page?: number; pageSize?: number; status?: 'open' | 'answered' | 'closed' } = {}, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['listHelpRequests']>> {
    return this.request('listHelpRequests', options, undefined, undefined, query)
  }

  getHelpRequest(helpRequestId: string, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['getHelpRequest']>> {
    return this.request('getHelpRequest', options, helpRequestId)
  }

  listTeacherHelpRequests(offeringId: string, query: { page?: number; pageSize?: number; status?: 'open' | 'answered' | 'closed' } = {}, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['listTeacherHelpRequests']>> {
    return this.request('listTeacherHelpRequests', options, offeringId, undefined, query)
  }

  getTeacherHelpRequest(helpRequestId: string, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['getTeacherHelpRequest']>> {
    return this.request('getTeacherHelpRequest', options, helpRequestId)
  }

  replyToHelpRequest(helpRequestId: string, body: HelpReplyWrite, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['replyToHelpRequest']>> {
    return this.request('replyToHelpRequest', options, helpRequestId, body)
  }

  closeHelpRequest(helpRequestId: string, body: HelpStatusWrite, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['closeHelpRequest']>> {
    return this.request('closeHelpRequest', options, helpRequestId, body)
  }

  recordLearningEvents(body: LearningEventsWrite, options: TutoringRequestOptions = {}): Promise<ApiResult<TutoringPayloads['recordLearningEvents']>> {
    return this.request('recordLearningEvents', options, undefined, body)
  }
}
