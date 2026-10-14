import type { components, operations, paths } from './generated/schema'
import type { ApiClient, ApiResult, OperationSpec, RequestOptions } from './client'

type Schemas = components['schemas']

export type UUID = Schemas['UUID']
export type OfferingDTO = Schemas['OfferingDTO']
export type BaseCourseDTO = Schemas['BaseCourseDTO']
export type CourseSummaryDTO = Schemas['CourseSummaryDTO']
export type CoursePage = Schemas['CoursePage']
export type OfferingPage = Schemas['OfferingPage']
export type BaseCoursePage = Schemas['BaseCoursePage']
export type MemberDTO = Schemas['MemberDTO']
export type MemberPage = Schemas['MemberPage']
export type ChapterSummaryDTO = Schemas['ChapterSummaryDTO']
export type ChapterDetailDTO = Schemas['ChapterDetailDTO']
export type TeacherChapterSummaryDTO = Schemas['TeacherChapterSummaryDTO']
export type TeacherChapterDetailDTO = Schemas['TeacherChapterDetailDTO']
export type ChapterListDTO = Schemas['ChapterListDTO']
export type TeacherChapterListDTO = Schemas['TeacherChapterListDTO']
export type ResourceDTO = Schemas['ResourceDTO']
export type KnowledgePointDTO = Schemas['KnowledgePointDTO']
export type KnowledgePointListDTO = Schemas['KnowledgePointListDTO']
export type InviteDTO = Schemas['InviteDTO']
export type InviteCreatedDTO = Schemas['InviteCreatedDTO']
export type InvitePage = Schemas['InvitePage']
export type EnrollmentDTO = Schemas['EnrollmentDTO']
export type ProgressDTO = Schemas['ProgressDTO']
export type ChapterProgressDTO = Schemas['ChapterProgressDTO']
export type LearningPositionDTO = Schemas['LearningPositionDTO']
export type EnrollmentWrite = Schemas['EnrollmentWrite']
export type OfferingWrite = Schemas['OfferingWrite']
export type ChapterWrite = Schemas['ChapterWrite']
export type ChapterPatch = Schemas['ChapterPatch']
export type KnowledgePointWrite = Schemas['KnowledgePointWrite']
export type KnowledgePointPatch = Schemas['KnowledgePointPatch']
export type ResourceWrite = Schemas['ResourceWrite']
export type ResourcePatch = Schemas['ResourcePatch']
export type InviteWrite = Schemas['InviteWrite']
export type ChapterProgressWrite = Schemas['ChapterProgressWrite']
export type LearningPositionWrite = Schemas['LearningPositionWrite']

export type MyCoursesQuery = NonNullable<operations['listMyCourses']['parameters']['query']>
export type TeacherOfferingsQuery = NonNullable<operations['listTeacherOfferings']['parameters']['query']>
export type BaseCoursesQuery = NonNullable<operations['listBaseCourses']['parameters']['query']>
export type MembersQuery = NonNullable<operations['listMembers']['parameters']['query']>
export type InvitesQuery = NonNullable<operations['listInvites']['parameters']['query']>
export type CourseRequestOptions = Pick<RequestOptions, 'signal' | 'csrfToken'>

export type CourseOperationId = keyof Pick<operations,
  | 'listMyCourses'
  | 'enroll'
  | 'getOffering'
  | 'listChapters'
  | 'getChapter'
  | 'getResource'
  | 'updateChapterProgress'
  | 'recordLearningPosition'
  | 'listBaseCourses'
  | 'listTeacherOfferings'
  | 'createOffering'
  | 'archiveOffering'
  | 'listMembers'
  | 'listTeacherChapters'
  | 'createChapter'
  | 'getTeacherChapter'
  | 'patchChapter'
  | 'publishChapter'
  | 'listKnowledgePoints'
  | 'createKnowledgePoint'
  | 'patchKnowledgePoint'
  | 'createResource'
  | 'patchResource'
  | 'archiveResource'
  | 'listInvites'
  | 'createInvite'
  | 'revokeInvite'
>

type CoursePayloads = { [K in CourseOperationId]: Schemas[`Response_${K}`]['data'] }
type CourseSpecs = { [K in CourseOperationId]: OperationSpec & { id: K; path: keyof paths } }

// Paths, methods and CSRF requirements come from the P1-A contract slice.
export const COURSE_SPECS = {
  listMyCourses: { id: 'listMyCourses', method: 'GET', path: '/api/v1/me/courses', csrf: false },
  enroll: { id: 'enroll', method: 'POST', path: '/api/v1/me/enrollments', csrf: true },
  getOffering: { id: 'getOffering', method: 'GET', path: '/api/v1/offerings/{offeringId}', csrf: false },
  listChapters: { id: 'listChapters', method: 'GET', path: '/api/v1/offerings/{offeringId}/chapters', csrf: false },
  getChapter: { id: 'getChapter', method: 'GET', path: '/api/v1/chapters/{chapterId}', csrf: false },
  getResource: { id: 'getResource', method: 'GET', path: '/api/v1/resources/{resourceId}', csrf: false },
  updateChapterProgress: { id: 'updateChapterProgress', method: 'PUT', path: '/api/v1/chapters/{chapterId}/progress', csrf: true },
  recordLearningPosition: { id: 'recordLearningPosition', method: 'POST', path: '/api/v1/me/learning-position', csrf: true },
  listBaseCourses: { id: 'listBaseCourses', method: 'GET', path: '/api/v1/teacher/courses', csrf: false },
  listTeacherOfferings: { id: 'listTeacherOfferings', method: 'GET', path: '/api/v1/teacher/offerings', csrf: false },
  createOffering: { id: 'createOffering', method: 'POST', path: '/api/v1/teacher/offerings', csrf: true },
  archiveOffering: { id: 'archiveOffering', method: 'POST', path: '/api/v1/teacher/offerings/{offeringId}/archive', csrf: true },
  listMembers: { id: 'listMembers', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/members', csrf: false },
  listTeacherChapters: { id: 'listTeacherChapters', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/chapters', csrf: false },
  createChapter: { id: 'createChapter', method: 'POST', path: '/api/v1/teacher/offerings/{offeringId}/chapters', csrf: true },
  getTeacherChapter: { id: 'getTeacherChapter', method: 'GET', path: '/api/v1/teacher/chapters/{chapterId}', csrf: false },
  patchChapter: { id: 'patchChapter', method: 'PATCH', path: '/api/v1/teacher/chapters/{chapterId}', csrf: true },
  publishChapter: { id: 'publishChapter', method: 'POST', path: '/api/v1/teacher/chapters/{chapterId}/publish', csrf: true },
  listKnowledgePoints: { id: 'listKnowledgePoints', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/knowledge-points', csrf: false },
  createKnowledgePoint: { id: 'createKnowledgePoint', method: 'POST', path: '/api/v1/teacher/offerings/{offeringId}/knowledge-points', csrf: true },
  patchKnowledgePoint: { id: 'patchKnowledgePoint', method: 'PATCH', path: '/api/v1/teacher/knowledge-points/{knowledgePointId}', csrf: true },
  createResource: { id: 'createResource', method: 'POST', path: '/api/v1/teacher/chapters/{chapterId}/resources', csrf: true },
  patchResource: { id: 'patchResource', method: 'PATCH', path: '/api/v1/teacher/resources/{resourceId}', csrf: true },
  archiveResource: { id: 'archiveResource', method: 'DELETE', path: '/api/v1/teacher/resources/{resourceId}', csrf: true },
  listInvites: { id: 'listInvites', method: 'GET', path: '/api/v1/teacher/offerings/{offeringId}/invites', csrf: false },
  createInvite: { id: 'createInvite', method: 'POST', path: '/api/v1/teacher/offerings/{offeringId}/invites', csrf: true },
  revokeInvite: { id: 'revokeInvite', method: 'POST', path: '/api/v1/teacher/invites/{inviteId}/revoke', csrf: true },
} satisfies CourseSpecs

function queryStrings(query: object): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

export class CoursesApi {
  constructor(private readonly client: ApiClient) {}

  private request<K extends CourseOperationId>(operationId: K, options: CourseRequestOptions, id?: string, body?: unknown, query?: object): Promise<ApiResult<CoursePayloads[K]>> {
    const spec = COURSE_SPECS[operationId]
    const path = id === undefined ? spec.path : spec.path.replace(/\{[^}]+\}/, encodeURIComponent(id))
    return this.client.request<CoursePayloads[K]>({ ...spec, path }, {
      ...options,
      ...(body === undefined ? {} : { body }),
      ...(query === undefined ? {} : { query: queryStrings(query) }),
    })
  }

  listMyCourses(query: MyCoursesQuery = {}, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['listMyCourses']>> {
    return this.request('listMyCourses', options, undefined, undefined, query)
  }

  enroll(body: EnrollmentWrite, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['enroll']>> {
    return this.request('enroll', options, undefined, body)
  }

  getOffering(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['getOffering']>> {
    return this.request('getOffering', options, id)
  }

  listChapters(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['listChapters']>> {
    return this.request('listChapters', options, id)
  }

  getChapter(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['getChapter']>> {
    return this.request('getChapter', options, id)
  }

  getResource(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['getResource']>> {
    return this.request('getResource', options, id)
  }

  updateChapterProgress(id: UUID, body: ChapterProgressWrite, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['updateChapterProgress']>> {
    return this.request('updateChapterProgress', options, id, body)
  }

  recordLearningPosition(body: LearningPositionWrite, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['recordLearningPosition']>> {
    return this.request('recordLearningPosition', options, undefined, body)
  }

  listBaseCourses(query: BaseCoursesQuery = {}, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['listBaseCourses']>> {
    return this.request('listBaseCourses', options, undefined, undefined, query)
  }

  listTeacherOfferings(query: TeacherOfferingsQuery = {}, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['listTeacherOfferings']>> {
    return this.request('listTeacherOfferings', options, undefined, undefined, query)
  }

  createOffering(body: OfferingWrite, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['createOffering']>> {
    return this.request('createOffering', options, undefined, body)
  }

  archiveOffering(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['archiveOffering']>> {
    return this.request('archiveOffering', options, id, {})
  }

  listMembers(id: UUID, query: MembersQuery = {}, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['listMembers']>> {
    return this.request('listMembers', options, id, undefined, query)
  }

  listTeacherChapters(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['listTeacherChapters']>> {
    return this.request('listTeacherChapters', options, id)
  }

  createChapter(id: UUID, body: ChapterWrite, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['createChapter']>> {
    return this.request('createChapter', options, id, body)
  }

  getTeacherChapter(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['getTeacherChapter']>> {
    return this.request('getTeacherChapter', options, id)
  }

  patchChapter(id: UUID, body: ChapterPatch, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['patchChapter']>> {
    return this.request('patchChapter', options, id, body)
  }

  publishChapter(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['publishChapter']>> {
    return this.request('publishChapter', options, id, {})
  }

  listKnowledgePoints(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['listKnowledgePoints']>> {
    return this.request('listKnowledgePoints', options, id)
  }

  createKnowledgePoint(id: UUID, body: KnowledgePointWrite, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['createKnowledgePoint']>> {
    return this.request('createKnowledgePoint', options, id, body)
  }

  patchKnowledgePoint(id: UUID, body: KnowledgePointPatch, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['patchKnowledgePoint']>> {
    return this.request('patchKnowledgePoint', options, id, body)
  }

  createResource(id: UUID, body: ResourceWrite, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['createResource']>> {
    return this.request('createResource', options, id, body)
  }

  patchResource(id: UUID, body: ResourcePatch, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['patchResource']>> {
    return this.request('patchResource', options, id, body)
  }

  archiveResource(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['archiveResource']>> {
    return this.request('archiveResource', options, id)
  }

  listInvites(id: UUID, query: InvitesQuery = {}, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['listInvites']>> {
    return this.request('listInvites', options, id, undefined, query)
  }

  createInvite(id: UUID, body: InviteWrite, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['createInvite']>> {
    return this.request('createInvite', options, id, body)
  }

  revokeInvite(id: UUID, options: CourseRequestOptions = {}): Promise<ApiResult<CoursePayloads['revokeInvite']>> {
    return this.request('revokeInvite', options, id, {})
  }
}
