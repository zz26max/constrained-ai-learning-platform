import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import { registerAuthApi, registerCoursesApi, registerAssignmentsApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { CoursesApi } from '../src/api/courses'
import { AssignmentsApi } from '../src/api/assignments'
import { P1B_IDS } from '../src/mocks/assignments'
import { P1A_IDS } from '../src/mocks/courses'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, failEnvelope, okEnvelope, type ScriptedResponse, type ScriptedTransport, type ScriptHandler } from './helpers'

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined
let createdAssignmentId: string | null = null

const createdId = '00000000-0000-4000-8000-000000000706'

function normalResponse(request: Parameters<ScriptHandler>[0]): ScriptedResponse {
  const id = request.path.split('/').filter(Boolean).at(-1) ?? ''
  switch (request.operationId) {
    case 'listTeacherAssignments':
      return okEnvelope({ items: [
        { id: P1B_IDS.assignmentWeb, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: 'HTML 表单实现', type: 'web_lab', isRequired: true, description: '完成编程任务', requirements: ['实现功能'], estimatedMinutes: 120, knowledgePointIds: [], dueAt: '2026-11-01T16:00:00Z', lateUntil: '2026-11-03T16:00:00Z', allowResubmit: true, maxAttempts: 3, maxScore: 80, rubric: [{ criterionId: 'c1', title: '代码正确性', description: '实现符合需求', maxScore: 50 }], initialFiles: [{ path: 'main.js', content: '// 代码\n' }], aiPolicyVersion: 1, publicationState: 'published', publishedAt: '2026-10-14T02:00:00Z', submittedStudentCount: 0, pendingReviewCount: 0 },
        ...(createdAssignmentId ? [{ id: createdAssignmentId, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: '新作业', type: 'web_lab', isRequired: true, description: '新作业描述', requirements: ['完成任务'], estimatedMinutes: 60, knowledgePointIds: [], dueAt: '2026-11-10T16:00:00Z', lateUntil: null, allowResubmit: false, maxAttempts: 1, maxScore: 100, rubric: [], initialFiles: [], aiPolicyVersion: 1, publicationState: 'draft', publishedAt: null, submittedStudentCount: 0, pendingReviewCount: 0 }] : []),
      ]})
    case 'createAssignment': {
      createdAssignmentId = createdId
      const body = JSON.parse(request.body ?? '{}')
      return okEnvelope({ id: createdId, offeringId: P1A_IDS.offeringWeb, ...body, publicationState: 'draft', publishedAt: null, submittedStudentCount: 0, pendingReviewCount: 0 }, 'req-create-assignment')
    }
    case 'getTeacherAssignment':
      if (id === createdId) {
        return okEnvelope({ id: createdId, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: '新作业', type: 'web_lab', isRequired: true, description: '新作业描述', requirements: ['完成任务'], estimatedMinutes: 60, knowledgePointIds: [], dueAt: '2026-11-10T16:00:00Z', lateUntil: null, allowResubmit: false, maxAttempts: 1, maxScore: 100, rubric: [], initialFiles: [], aiPolicyVersion: 1, publicationState: 'draft', publishedAt: null, submittedStudentCount: 0, pendingReviewCount: 0 })
      }
      return okEnvelope({ id, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: 'HTML 表单实现', type: 'web_lab', isRequired: true, description: '完成编程任务', requirements: ['实现功能'], estimatedMinutes: 120, knowledgePointIds: [], dueAt: '2026-11-01T16:00:00Z', lateUntil: '2026-11-03T16:00:00Z', allowResubmit: true, maxAttempts: 3, maxScore: 80, rubric: [{ criterionId: 'c1', title: '代码正确性', description: '实现符合需求', maxScore: 50 }], initialFiles: [{ path: 'main.js', content: '// 代码\n' }], aiPolicyVersion: 1, publicationState: 'published', publishedAt: '2026-10-14T02:00:00Z', submittedStudentCount: 0, pendingReviewCount: 0 })
    case 'patchAssignment':
      return okEnvelope({ id, offeringId: P1A_IDS.offeringWeb, ...JSON.parse(request.body ?? '{}'), publicationState: 'draft', publishedAt: null, submittedStudentCount: 0, pendingReviewCount: 0 }, 'req-patch-assignment')
    case 'publishAssignment':
      return okEnvelope({ id, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: '新作业', type: 'web_lab', isRequired: true, description: '新作业描述', requirements: ['完成任务'], estimatedMinutes: 60, knowledgePointIds: [], dueAt: '2026-11-10T16:00:00Z', lateUntil: null, allowResubmit: false, maxAttempts: 1, maxScore: 100, rubric: [], initialFiles: [], aiPolicyVersion: 1, publicationState: 'published', publishedAt: '2026-10-14T05:00:00Z', submittedStudentCount: 0, pendingReviewCount: 0 }, 'req-publish')
    case 'archiveAssignment':
      return okEnvelope({ id, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: 'HTML 表单实现', type: 'web_lab', isRequired: true, description: '完成编程任务', requirements: ['实现功能'], estimatedMinutes: 120, knowledgePointIds: [], dueAt: '2026-11-01T16:00:00Z', lateUntil: '2026-11-03T16:00:00Z', allowResubmit: true, maxAttempts: 3, maxScore: 80, rubric: [], initialFiles: [], aiPolicyVersion: 1, publicationState: 'archived', publishedAt: '2026-10-14T02:00:00Z', submittedStudentCount: 0, pendingReviewCount: 0 }, 'req-archive')
    default: throw new Error(`未脚本化操作：${request.operationId}`)
  }
}

function setHandler(handler: ScriptHandler = normalResponse): void {
  scripted.setHandler(handler)
}

beforeEach(() => {
  scripted = createScriptedTransport()
  createdAssignmentId = null
  setHandler()
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
  registerAssignmentsApi(new AssignmentsApi(client))
})

afterEach(() => {
  wrapper?.unmount()
  router?.options.history.destroy()
  wrapper = undefined
  router = undefined
  document.body.innerHTML = ''
})

async function openOfferingAssignments(offeringId = P1A_IDS.offeringWeb): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-teacher',
    identity: { ...DEMO_USER, roles: ['teacher'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  await router.push(`/teacher/offerings/${offeringId}/assignments`)
  await router.isReady()
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  if (wrapper === undefined) throw new Error('页面未挂载')
  return wrapper
}

function buttonNamed(rendered: VueWrapper, text: string) {
  const button = rendered.findAll('button').find(item => item.text() === text)
  if (!button) throw new Error(`没有找到按钮：${text}`)
  return button
}

function postRequests(operationId: string) {
  return scripted.requests.filter(request => request.operationId === operationId)
}

describe('P1-B 教师作业路径', () => {
  it('创建作业草稿并发布', async () => {
    const rendered = await openOfferingAssignments()
    const createLink = rendered.findAll('a').find(link => link.text().includes('创建作业'))
    if (!createLink) throw new Error('未找到创建作业链接')
    await createLink.trigger('click')
    await flushPromises()
    await router?.isReady()

    await rendered.find('#title').setValue('新作业')
    await rendered.find('#description').setValue('新作业描述')
    await buttonNamed(rendered, '保存').trigger('click')
    await flushPromises()

    expect(postRequests('createAssignment')).toHaveLength(1)

    await router?.push(`/teacher/offerings/${P1A_IDS.offeringWeb}/assignments`)
    await router?.isReady()
    await flushPromises()

    await buttonNamed(rendered, '发布').trigger('click')
    await flushPromises()

    expect(postRequests('publishAssignment')).toHaveLength(1)
  })

  it('归档作业：待批阅拦截 ARCHIVE_PENDING_REVIEWS', async () => {
    setHandler(request => {
      if (request.operationId === 'listTeacherAssignments') {
        return okEnvelope({ items: [{ id: P1B_IDS.assignmentWeb, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: 'HTML 表单实现', type: 'web_lab', isRequired: true, description: '完成编程任务', requirements: [], estimatedMinutes: 120, knowledgePointIds: [], dueAt: '2026-11-01T16:00:00Z', lateUntil: null, allowResubmit: true, maxAttempts: 3, maxScore: 80, rubric: [], initialFiles: [], aiPolicyVersion: 1, publicationState: 'published', publishedAt: '2026-10-14T02:00:00Z', submittedStudentCount: 1, pendingReviewCount: 1 }]})
      }
      if (request.operationId === 'archiveAssignment') {
        return failEnvelope(409, 'ARCHIVE_PENDING_REVIEWS', {}, 'req-pending-reviews')
      }
      return normalResponse(request)
    })

    const rendered = await openOfferingAssignments()
    await buttonNamed(rendered, '归档').trigger('click')
    await flushPromises()

    await vi.waitFor(() => {
      const alert = rendered.find('[role="alert"]')
      return alert.exists() && ['待批阅', 'ARCHIVE_PENDING_REVIEWS'].some(v => alert.text().includes(v))
    }, { timeout: 1000 })
    expect(postRequests('archiveAssignment')).toHaveLength(1)
  })

  it('归档教学班后禁用创建与发布操作', async () => {
    setHandler(request => {
      if (request.operationId === 'listTeacherAssignments') {
        return okEnvelope({ items: [] })
      }
      if (request.operationId === 'createAssignment' || request.operationId === 'publishAssignment') {
        return failEnvelope(409, 'OFFERING_ARCHIVED', {}, 'req-archived-offering')
      }
      return normalResponse(request)
    })

    const rendered = await openOfferingAssignments()
    const createLink = rendered.findAll('a').find(link => link.text().includes('创建'))
    if (createLink) {
      await createLink.trigger('click')
      await flushPromises()
      await router?.isReady()

      await rendered.find('#title').setValue('归档班级作业')
      await buttonNamed(rendered, '保存').trigger('click')
      await flushPromises()

      await vi.waitFor(() => {
        const alert = rendered.find('[role="alert"]')
        return alert.exists() && ['归档', 'OFFERING_ARCHIVED'].some(v => alert.text().includes(v))
      }, { timeout: 1000 })
    }
  })

  it('创建操作失败后可重试，不会锁死', async () => {
    let createAttempts = 0
    setHandler(request => {
      if (request.operationId === 'createAssignment') {
        createAttempts += 1
        if (createAttempts === 1) return failEnvelope(500, 'INTERNAL_ERROR', {}, 'req-first-fail')
        return normalResponse(request)
      }
      return normalResponse(request)
    })

    const rendered = await openOfferingAssignments()
    const createLink = rendered.findAll('a').find(link => link.text().includes('创建作业'))
    if (!createLink) throw new Error('未找到创建作业链接')
    await createLink.trigger('click')
    await flushPromises()
    await router?.isReady()

    await rendered.find('#title').setValue('重试作业')
    await buttonNamed(rendered, '保存').trigger('click')
    await flushPromises()

    expect(postRequests('createAssignment')).toHaveLength(1)
    expect(rendered.find('[role="alert"]').exists()).toBe(true)

    await buttonNamed(rendered, '保存').trigger('click')
    await flushPromises()

    expect(postRequests('createAssignment')).toHaveLength(2)
  })
})
