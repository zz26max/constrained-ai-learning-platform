import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import { createAppRouter } from '../src/app/router'
import App from '../src/app/App.vue'
import { registerAuthApi, registerAssignmentsApi, registerCoursesApi } from '../src/api'
import { ApiClient } from '../src/api/client'
import { AuthApi } from '../src/api/auth'
import { CoursesApi } from '../src/api/courses'
import { AssignmentsApi } from '../src/api/assignments'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_USER, okEnvelope, failEnvelope } from './helpers'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let wrapper: VueWrapper | undefined, router: Router | undefined
afterEach(() => { wrapper?.unmount(); router?.options.history.destroy() })
async function open(fail = false, mismatched = false) {
  const scripted = createScriptedTransport()
  const feedback = { id: id(3), assignmentId: mismatched ? id(99) : id(1), submissionId: id(2), messageId: id(4), status: 'published', score: 90, maxScore: 100, rubricResults: [], comment: '对应旧作品的公开评价', publishedAt: '2026-10-17T00:00:00Z' }
  scripted.setHandler(request => {
    switch (request.operationId) {
      case 'getAssignment': return okEnvelope({ id: id(1), title: '作业', requirements: [], rubric: [], description: '', publicationState: 'published', offeringStatus: 'active', latestSubmissionId: id(9), canSubmit: false })
      case 'listMySubmissions': return okEnvelope({ items: [{ id: id(2), attemptNumber: 1, workspaceRevision: 2 }], page: 1, pageSize: 10, total: 1 })
      case 'getFeedback': return fail ? failEnvelope(404, 'NOT_FOUND', {}, 'req-missing') : okEnvelope(feedback)
      case 'getSubmission': return okEnvelope({ id: id(2), assignmentId: id(1), attemptNumber: 1, workspaceRevision: 2, files: [{ path: 'index.html', content: '<script>privateCode()</script>' }], reflection: '提交时的反思', assignmentSnapshot: { rubric: [] }, publishedFeedback: feedback })
      case 'readMessage': return okEnvelope({ id: id(4), readAt: '2026-10-17T01:00:00Z' })
      default: throw new Error(request.operationId)
    }
  })
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client)); registerCoursesApi(new CoursesApi(client)); registerAssignmentsApi(new AssignmentsApi(client))
  const pinia = createPinia(); setActivePinia(pinia)
  useAuthStore().$patch({ phase: 'authenticated', bootStatus: 'success', csrfToken: 'test', identity: { ...DEMO_USER, roles: ['student'] } })
  router = createAppRouter(createMemoryHistory())
  await router.push(`/student/assignments/${id(1)}?feedbackId=${id(3)}`)
  wrapper = mount(App, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return scripted.requests
}
describe('学生作品与指定评价闭环', () => {
  it('使用链接的评价及提交而非最新提交；展示快照后标读对应消息', async () => {
    const requests = await open()
    expect(requests.find(r => r.operationId === 'getSubmission')?.path).toContain(id(2))
    expect(requests.find(r => r.operationId === 'readMessage')?.path).toContain(id(4))
    expect(wrapper!.text()).toContain('对应旧作品的公开评价')
    expect(wrapper!.text()).toContain('提交时的反思')
    expect(wrapper!.find('pre').text()).toBe('<script>privateCode()</script>')
    expect(wrapper!.find('script').exists()).toBe(false)
  })
  it('评价读取失败不请求快照也不标记已读', async () => {
    const requests = await open(true)
    expect(requests.some(r => r.operationId === 'readMessage' || r.operationId === 'getSubmission')).toBe(false)
    expect(wrapper!.text()).toContain('内容不存在或无权访问')
  })
  it('评价与当前作业不匹配时不展示或标读', async () => {
    const requests = await open(false, true)
    expect(requests.some(r => r.operationId === 'readMessage')).toBe(false)
    expect(wrapper!.text()).not.toContain('对应旧作品的公开评价')
    expect(wrapper!.text()).toContain('评价不属于当前作业')
  })
})
