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

function normalResponse(request: Parameters<ScriptHandler>[0]): ScriptedResponse {
  const id = request.path.split('/').filter(Boolean).at(-1) ?? ''
  switch (request.operationId) {
    case 'listMyAssignments':
      return okEnvelope({ items: [
        { id: P1B_IDS.assignmentWeb, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: 'HTML 表单实现', type: 'web_lab', isRequired: true, publicationState: 'published', description: '完成编程任务', dueAt: '2026-11-01T16:00:00Z', assignmentState: 'NOT_STARTED', overdue: false, latestSubmissionId: null, publishedFeedbackId: null, unreadFeedback: false, offeringStatus: 'active' },
      ],total:1,page:1,pageSize:100})
    case 'listMyCourses': return okEnvelope({items:[],page:1,pageSize:100,total:0})
    case 'getAssignment':
      return okEnvelope({ id, offeringId: P1A_IDS.offeringWeb, chapterId: P1A_IDS.chapterWeb, title: 'HTML 表单实现', type: 'web_lab', isRequired: true, publicationState: 'published', description: '完成编程任务', dueAt: '2026-11-01T16:00:00Z', assignmentState: 'NOT_STARTED', overdue: false, latestSubmissionId: null, publishedFeedbackId: null, unreadFeedback: false, requirements: ['实现功能', '通过测试'], estimatedMinutes: 120, maxScore: 80, rubric: [{ criterionId: 'c1', title: '代码正确性', description: '实现符合需求', maxScore: 50 }], knowledgePointIds: [], lateUntil: '2026-11-03T16:00:00Z', allowResubmit: true, maxAttempts: 3, attemptsUsed: 0, canSubmit: true, submissionBlockedReason: null, aiPolicyVersion: 1, offeringStatus: 'active' })
    case 'getWorkspace':
      return okEnvelope({ assignmentId: id, revision: 1, files: [{ path: 'index.html', content: '<!DOCTYPE html>\n<html>\n</html>' }], activeFile: 'index.html', savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null })
    case 'saveWorkspace':
      return okEnvelope({ assignmentId: id, revision: 2, files: JSON.parse(request.body ?? '{}').files, activeFile: JSON.parse(request.body ?? '{}').activeFile, savedAt: '2026-10-14T03:00:00Z', canSave: true, saveBlockedReason: null }, 'req-save-workspace')
    case 'submitAssignment':
      return okEnvelope({ id: P1B_IDS.submissionWeb1, assignmentId: id, offeringId: P1A_IDS.offeringWeb, attemptNumber: 1, workspaceRevision: JSON.parse(request.body ?? '{}').workspaceRevision, submittedAt: '2026-10-14T04:00:00Z', late: false, superseded: false, feedbackStatus: 'pending' }, 'req-submit')
    case 'listMySubmissions':
      return okEnvelope({ items: [] })
    default: throw new Error(`未脚本化操作：${request.operationId}`)
  }
}

function setHandler(handler: ScriptHandler = normalResponse): void {
  scripted.setHandler(handler)
}

beforeEach(() => {
  scripted = createScriptedTransport()
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

async function openAssignment(assignmentId = P1B_IDS.assignmentWeb): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-student',
    identity: { ...DEMO_USER, roles: ['student'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  await router.push(`/student/assignments/${assignmentId}`)
  await router.isReady()
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  if (wrapper === undefined) throw new Error('页面未挂载')
  return wrapper
}

async function openWorkspace(assignmentId = P1B_IDS.assignmentWeb): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-student',
    identity: { ...DEMO_USER, roles: ['student'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  await router.push(`/student/workspaces/${assignmentId}`)
  await router.isReady()
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  if (wrapper === undefined) throw new Error('页面未挂载')
  return wrapper
}

function postRequests(operationId: string) {
  return scripted.requests.filter(request => request.operationId === operationId)
}

describe('P1-B 学生作业路径', () => {
  it('列出学生作业并查看详情', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().$patch({
      phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-student',
      identity: { ...DEMO_USER, roles: ['student'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
    })
    router = createAppRouter(createMemoryHistory())
    await router.push('/student/assignments')
    await router.isReady()
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('HTML 表单实现')
    expect(scripted.requests.filter(r => r.operationId === 'listMyAssignments')).toHaveLength(1)
  })

  it('保存工作区：baseRevision 正确传递，单次在途', async () => {
    const rendered = await openWorkspace()
    const textarea = rendered.find('textarea.workspace-editor')
    if (!textarea.exists()) throw new Error('未找到编辑器')

    await textarea.setValue('<!DOCTYPE html>\n<html>\n<body>新代码</body>\n</html>')
    await vi.waitFor(() => expect(postRequests('saveWorkspace')).toHaveLength(1), { timeout: 2500 })

    const saveRequest = postRequests('saveWorkspace')[0]
    const body = JSON.parse(saveRequest?.body ?? '{}')
    expect(body.baseRevision).toBe(1)
    expect(body.files[0].content).toContain('新代码')
  })

  it('工作区保存 409 WORKSPACE_CONFLICT：显示错误提示', async () => {
    setHandler(request => request.operationId === 'saveWorkspace'
      ? failEnvelope(409, 'WORKSPACE_CONFLICT', { currentRevision: 2 }, 'req-conflict')
      : normalResponse(request))
    const rendered = await openWorkspace()
    const textarea = rendered.find('textarea.workspace-editor')
    await textarea.setValue('<!DOCTYPE html>\n<html>\n<body>冲突代码</body>\n</html>')
    await vi.waitFor(() => {
      const notice = rendered.find('.notice-error, [role="alert"]')
      return notice.exists()
    }, { timeout: 2500 })
  })

  it('提交作业：传递 workspaceRevision，返回 201', async () => {
    const rendered = await openWorkspace()
    const submitButton = rendered.findAll('button').find(btn => btn.text().includes('提交'))
    if (!submitButton) throw new Error('未找到提交按钮')

    await submitButton.trigger('click')
    await flushPromises()

    const reflectionTextarea = rendered.find('textarea#reflection')
    await reflectionTextarea.setValue('完成了基本功能实现')
    const confirmCheckbox = rendered.find('input[type="checkbox"]')
    await confirmCheckbox.setValue(true)
    await flushPromises()

    const confirmButton = rendered.findAll('button').find(btn => btn.text().includes('确认提交'))
    await confirmButton?.trigger('click')
    await flushPromises()

    expect(postRequests('submitAssignment')).toHaveLength(1)
    const submitRequest = postRequests('submitAssignment')[0]
    const body = JSON.parse(submitRequest?.body ?? '{}')
    expect(body.workspaceRevision).toBe(1)
    expect(submitRequest?.headers['X-Request-ID']).toBeDefined()
  })

  it('提交被拒 409 ATTEMPT_LIMIT_REACHED：显示错误', async () => {
    setHandler(request => request.operationId === 'submitAssignment'
      ? failEnvelope(409, 'ATTEMPT_LIMIT_REACHED', {}, 'req-attempt-limit')
      : normalResponse(request))
    const rendered = await openWorkspace()
    const submitButton = rendered.findAll('button').find(btn => btn.text().includes('提交'))
    await submitButton?.trigger('click')
    await flushPromises()

    const dialog = rendered.find('dialog')
    const reflectionTextarea = dialog.find('textarea#reflection')
    if (reflectionTextarea.exists()) {
      await reflectionTextarea.setValue('完成了基本功能实现')
      const confirmCheckbox = dialog.find('input[type="checkbox"]')
      await confirmCheckbox.setValue(true)
      await flushPromises()

      const confirmButton = dialog.findAll('button').find(btn => btn.text().includes('确认提交'))
      await confirmButton?.trigger('click')
      await flushPromises()
    }

    const notice = rendered.find('.notice-error, [role="alert"]')
    expect(notice.exists()).toBe(true)
  })

  it('防抖逻辑：1.5s 内多次编辑只发一次保存', async () => {
    const rendered = await openWorkspace()
    const textarea = rendered.find('textarea.workspace-editor')

    await textarea.setValue('<!DOCTYPE html>\n<html>\n<body>第一次</body>\n</html>')
    await new Promise(resolve => setTimeout(resolve, 500))
    await textarea.setValue('<!DOCTYPE html>\n<html>\n<body>第二次</body>\n</html>')
    await new Promise(resolve => setTimeout(resolve, 500))
    await textarea.setValue('<!DOCTYPE html>\n<html>\n<body>第三次</body>\n</html>')

    await vi.waitFor(() => expect(postRequests('saveWorkspace')).toHaveLength(1), { timeout: 2500 })
    const body = JSON.parse(postRequests('saveWorkspace')[0]?.body ?? '{}')
    expect(body.files[0].content).toContain('第三次')
  })

  it('保存在途时编辑：等待完成后再发下一次', async () => {
    let release!: (response: ScriptedResponse) => void
    const pending = new Promise<ScriptedResponse>(resolve => { release = resolve })
    setHandler(request => request.operationId === 'saveWorkspace' ? pending : normalResponse(request))

    const rendered = await openWorkspace()
    const textarea = rendered.find('textarea.workspace-editor')
    await textarea.setValue('<!DOCTYPE html>\n<html>\n<body>第一次</body>\n</html>')
    await vi.waitFor(() => expect(postRequests('saveWorkspace')).toHaveLength(1), { timeout: 2500 })

    await textarea.setValue('<!DOCTYPE html>\n<html>\n<body>第二次</body>\n</html>')
    await new Promise(resolve => setTimeout(resolve, 1600))
    expect(postRequests('saveWorkspace')).toHaveLength(1)

    release(okEnvelope({ assignmentId: P1B_IDS.assignmentWeb, revision: 2, files: [{ path: 'index.html', content: '<!DOCTYPE html>\n<html>\n<body>第一次</body>\n</html>' }], activeFile: 'index.html', savedAt: '2026-10-14T03:00:00Z', canSave: true, saveBlockedReason: null }))
    await vi.waitFor(() => expect(postRequests('saveWorkspace')).toHaveLength(2), { timeout: 2500 })

    const secondBody = JSON.parse(postRequests('saveWorkspace')[1]?.body ?? '{}')
    expect(secondBody.files[0].content).toContain('第二次')
    expect(secondBody.baseRevision).toBe(2)
  })
})
