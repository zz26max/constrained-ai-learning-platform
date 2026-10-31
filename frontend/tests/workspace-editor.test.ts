import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import { registerAssignmentsApi, registerAuthApi, registerCoursesApi, registerTutoringApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { AssignmentsApi } from '../src/api/assignments'
import { CoursesApi } from '../src/api/courses'
import { TutoringApi } from '../src/api/tutoring'
import { useAuthStore } from '../src/stores/auth'
import { clearWorkspaceRecovery } from '../src/features/assignments/workspace-recovery'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, failEnvelope, okEnvelope, type ScriptedResponse, type ScriptedTransport, type ScriptHandler } from './helpers'

const ASSIGNMENT = '00000000-0000-4000-8000-000000000701'
const ASSIGNMENT_B = '00000000-0000-4000-8000-000000000702'
const TUTOR_SESSION = '00000000-0000-4000-8000-000000000901'
const TUTOR_REQUEST = '00000000-0000-4000-8000-000000000902'

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined
let assignmentOverride: Record<string, unknown> = {}
let saveFails = false

function normalResponse(request: Parameters<ScriptHandler>[0]): ScriptedResponse {
  const body = request.body ? JSON.parse(request.body) as Record<string, unknown> : {}
  switch (request.operationId) {
    case 'getWorkspace': return okEnvelope({
      assignmentId: ASSIGNMENT, revision: 1, files: [{ path: 'index.html', content: '<p>v1</p>' }], activeFile: 'index.html',
      savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null,
    })
    case 'getAssignment': return okEnvelope({
      id: ASSIGNMENT, canSubmit: true, submissionBlockedReason: null,
      offeringId: '00000000-0000-4000-8000-000000000801', offeringStatus: 'active', publicationState: 'published',
      title: '卡片布局练习', type: 'web_lab', isRequired: true, estimatedMinutes: 30, maxScore: 100,
      description: '把卡片改成两列，窄屏时单列且不溢出。',
      requirements: ['使用 flex 布局', '窄屏不溢出'],
      rubric: [{ criterionId: 'c1', title: '布局正确性', description: '两列与单列切换正确', maxScore: 60 }],
      dueAt: '2026-10-20T02:00:00Z', overdue: false, lateUntil: null,
      assignmentState: 'IN_PROGRESS', attemptsUsed: 0, maxAttempts: 3, allowResubmit: true,
      ...assignmentOverride,
    })
    case 'getAiPolicy': return okEnvelope({
      assignmentId: ASSIGNMENT, version: 1, enabled: true,
      allowedActions: ['ask', 'concept', 'next_hint'], allowedModes: ['concept', 'debug_hint', 'guided_question'],
      restrictCompleteSolution: true, allowCodeBlocks: false, maxHintLevel: 3, requireAttemptFromLevel: 2,
      dailyUserLimit: 30, dailyAssignmentLimit: 12, perMinuteLimit: 3, maxOutputTokens: 800,
      boundaryText: '引导模式：只解释概念和排查方向。',
    })
    case 'listTutoringSessions': return okEnvelope({
      items: [{ id: TUTOR_SESSION, assignmentId: ASSIGNMENT, createdAt: '2026-10-14T02:00:00Z', status: 'active', pendingRequestId: null, lastMessageAt: null }],
      page: 1, pageSize: 20, total: 1,
    })
    case 'listTutoringMessages': return okEnvelope({ items: [], page: 1, pageSize: 50, total: 0 })
    case 'sendTutoringMessage': return { status: 202, body: { data: { tutoringRequestId: TUTOR_REQUEST, status: 'queued' }, requestId: 'req-ai' } }
    case 'getTutoringRequest': return okEnvelope({
      id: TUTOR_REQUEST, sessionId: TUTOR_SESSION, status: 'completed', result: null, error: null,
      createdAt: '2026-10-14T02:00:00Z', completedAt: '2026-10-14T02:00:01Z',
    })
    case 'saveWorkspace':
      return saveFails
        ? failEnvelope(409, 'WORKSPACE_CONFLICT', {}, 'req-conflict')
        : okEnvelope({
          assignmentId: ASSIGNMENT, revision: Number(body['baseRevision']) + 1, files: body['files'], activeFile: body['activeFile'],
          savedAt: '2026-10-14T02:05:00Z', canSave: true, saveBlockedReason: null,
        })
    case 'submitAssignment': return failEnvelope(422, 'VALIDATION_ERROR', {}, 'req-submit')
    case 'listMyAssignments': return okEnvelope({ items: [], summary: { allCount: 0 } })
    default: return okEnvelope({ items: [], page: 1, pageSize: 20, total: 0 })
  }
}

const requestsOf = (operationId: string) => scripted.requests.filter(request => request.operationId === operationId)
const bodyOf = (request: { body?: string }) => JSON.parse(request.body ?? '{}') as Record<string, unknown>

async function openWorkspace(): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-student',
    identity: { ...DEMO_USER, roles: ['student'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  await router.push(`/student/workspaces/${ASSIGNMENT}`)
  await router.isReady()
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

const submitButton = (page: VueWrapper) => page.findAll('button').find(item => item.text() === '提交作业')

async function editAndConfirmSubmit(page: VueWrapper, content: string): Promise<void> {
  await page.find('textarea.workspace-editor').setValue(content)
  await submitButton(page)?.trigger('click')
  await page.find('#reflection').setValue('我的反思')
  await page.find('input[type="checkbox"]').setValue(true)
  await page.findAll('button').find(item => item.text() === '确认提交')?.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  clearWorkspaceRecovery()
  assignmentOverride = {}
  saveFails = false
  if (typeof window.confirm !== 'function') window.confirm = () => false
  const dialog = HTMLDialogElement.prototype
  if (typeof dialog.showModal !== 'function') dialog.showModal = function showModal() { this.setAttribute('open', '') }
  if (typeof dialog.close !== 'function') dialog.close = function close() { this.removeAttribute('open') }
  scripted = createScriptedTransport()
  scripted.setHandler(normalResponse)
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
  registerAssignmentsApi(new AssignmentsApi(client))
  registerTutoringApi(new TutoringApi(client))
})

afterEach(() => {
  vi.restoreAllMocks()
  wrapper?.unmount()
  router?.options.history.destroy()
  wrapper = undefined
  router = undefined
  document.body.innerHTML = ''
})

describe('工作区立即提交（B1）', () => {
  it('防抖期内点提交：先保存最新内容，再用新 revision 提交', async () => {
    const page = await openWorkspace()
    await editAndConfirmSubmit(page, 'LATEST_MUST_BE_SUBMITTED')

    const saves = requestsOf('saveWorkspace')
    const submits = requestsOf('submitAssignment')
    expect(saves).toHaveLength(1)
    expect((bodyOf(saves[0]!)['files'] as { content: string }[])[0]?.content).toBe('LATEST_MUST_BE_SUBMITTED')
    expect(submits).toHaveLength(1)
    expect(bodyOf(submits[0]!)['workspaceRevision']).toBe(2)
    expect(scripted.requests.indexOf(saves[0]!)).toBeLessThan(scripted.requests.indexOf(submits[0]!))
  })

  it('最新修改保存失败时不提交，并显示原因', async () => {
    saveFails = true
    const page = await openWorkspace()
    await editAndConfirmSubmit(page, 'WILL_NOT_SAVE')

    expect(requestsOf('saveWorkspace')).toHaveLength(1)
    expect(requestsOf('submitAssignment')).toHaveLength(0)
    expect(page.text()).toContain('最新修改未能保存，已停止提交')
  })
})

describe('离开工作区保护（B2）', () => {
  it('有未保存修改时离开：先保存成功再放行，不弹确认', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const page = await openWorkspace()
    await page.find('textarea.workspace-editor').setValue('UNSAVED_ROUTE_CHANGE_MUST_WARN')
    await router!.push('/student/assignments')
    await flushPromises()

    const saves = requestsOf('saveWorkspace')
    expect(saves).toHaveLength(1)
    expect((bodyOf(saves[0]!)['files'] as { content: string }[])[0]?.content).toBe('UNSAVED_ROUTE_CHANGE_MUST_WARN')
    expect(confirm).not.toHaveBeenCalled()
    expect(router!.currentRoute.value.fullPath).toBe('/student/assignments')
  })

  it('保存失败且用户选择留下：停留在工作区并保留本地文字', async () => {
    saveFails = true
    const page = await openWorkspace()
    await page.find('textarea.workspace-editor').setValue('KEEP_ME')
    const navigation = router!.push('/student/assignments')
    await flushPromises()
    expect(page.find('#leave-title').text()).toBe('还有未保存的内容')
    await page.findAll('button').find(button => button.text() === '留在页面')!.trigger('click')
    await navigation
    expect(router!.currentRoute.value.fullPath).toBe(`/student/workspaces/${ASSIGNMENT}`)
    expect((page.find('textarea.workspace-editor').element as HTMLTextAreaElement).value).toBe('KEEP_ME')
  })

  it('保存失败且用户确认放弃：允许离开', async () => {
    saveFails = true
    const page = await openWorkspace()
    await page.find('textarea.workspace-editor').setValue('DISCARD_ME')
    const navigation = router!.push('/student/assignments')
    await flushPromises()
    await page.findAll('button').find(button => button.text() === '放弃修改并离开')!.trigger('click')
    await navigation

    expect(router!.currentRoute.value.fullPath).toBe('/student/assignments')
  })

  it('会话失效暂停写入；同账号重新登录后保留文字并要求比较恢复', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const page = await openWorkspace()
    await page.find('textarea.workspace-editor').setValue('AFTER_LOGOUT')
    useAuthStore().$patch({ phase: 'anonymous', identity: null })
    await router!.push('/login')
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 1600))
    await flushPromises()

    expect(requestsOf('saveWorkspace')).toHaveLength(0)
    expect(confirm).not.toHaveBeenCalled()
    expect(router!.currentRoute.value.name).toBe('login')
    useAuthStore().$patch({ phase: 'authenticated', identity: { ...DEMO_USER, roles: ['student'] }, csrfToken: 'renewed' })
    await router!.push(`/student/workspaces/${ASSIGNMENT}`)
    await flushPromises()
    expect((page.find('textarea.workspace-editor').element as HTMLTextAreaElement).value).toBe('AFTER_LOGOUT')
    expect(page.text()).toContain('已恢复本账号的本地编辑')
    expect(requestsOf('saveWorkspace')).toHaveLength(0)
  })

  it('从作业 A 的工作区直接切到作业 B：A 的修改保存到 A，不写入 B', async () => {
    const page = await openWorkspace()
    await page.find('textarea.workspace-editor').setValue('BELONGS_TO_A')
    await router!.push(`/student/workspaces/${ASSIGNMENT_B}`)
    await flushPromises()

    const saves = requestsOf('saveWorkspace')
    expect(saves).toHaveLength(1)
    expect(saves[0]!.path).toContain(ASSIGNMENT)
    expect(saves.some(request => request.path.includes(ASSIGNMENT_B))).toBe(false)
    expect(router!.currentRoute.value.fullPath).toBe(`/student/workspaces/${ASSIGNMENT_B}`)
  })

  it('没有任何编辑时离开不请求保存也不弹确认', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openWorkspace()
    await router!.push('/student/assignments')
    await flushPromises()

    expect(requestsOf('saveWorkspace')).toHaveLength(0)
    expect(confirm).not.toHaveBeenCalled()
    expect(router!.currentRoute.value.fullPath).toBe('/student/assignments')
  })
})

describe('正式提交资格以服务端 canSubmit 为准（B6）', () => {
  it('canSubmit 为 false：提交按钮禁用并显示后端原因，但仍可编辑保存', async () => {
    assignmentOverride = { canSubmit: false, submissionBlockedReason: 'SUBMISSION_CLOSED' }
    const page = await openWorkspace()

    expect(submitButton(page)?.attributes('disabled')).toBeDefined()
    expect(page.text()).toContain('提交窗口已关闭')
    expect(page.find('textarea.workspace-editor').attributes('disabled')).toBeUndefined()
  })

  it('canSubmit 为 true：提交按钮可点', async () => {
    const page = await openWorkspace()
    expect(submitButton(page)?.attributes('disabled')).toBeUndefined()
  })

  it('getAssignment 失败：按钮禁用且页面显示错误与 requestId', async () => {
    scripted.setHandler(request => request.operationId === 'getAssignment'
      ? failEnvelope(500, 'INTERNAL_ERROR', {}, 'req-assign-fail')
      : normalResponse(request))
    const page = await openWorkspace()

    expect(submitButton(page)?.attributes('disabled')).toBeDefined()
    expect(page.text()).toContain('req-assign-fail')
  })
})

const aiButton = (page: VueWrapper) => page.findAll('button').find(item => item.text() === 'AI')

async function openTutor(page: VueWrapper): Promise<void> {
  await aiButton(page)!.trigger('click')
  await flushPromises()
  await flushPromises()
}

describe('工作区题面与实时求助', () => {
  it('左侧题面展示说明、要求与评分标准，右侧保留编辑器与运行入口', async () => {
    const page = await openWorkspace()

    const problem = page.find('.ws-problem')
    expect(problem.exists()).toBe(true)
    expect(problem.text()).toContain('把卡片改成两列')
    expect(problem.text()).toContain('使用 flex 布局')
    expect(problem.text()).toContain('布局正确性')
    expect(problem.text()).toContain('60')
    expect(page.find('.ws-work').exists()).toBe(true)
    expect(page.findAll('button').some(item => item.text() === '运行')).toBe(true)
  })

  it('AI 求助侧边栏懒加载：点击前不请求辅导，关闭后卸载', async () => {
    const page = await openWorkspace()
    expect(page.find('.ws-tutor-inline').exists()).toBe(false)
    expect(requestsOf('getAiPolicy')).toHaveLength(0)
    expect(requestsOf('listTutoringSessions')).toHaveLength(0)

    await openTutor(page)
    expect(page.find('.ws-tutor-inline').exists()).toBe(true)
    expect(requestsOf('getAiPolicy')).toHaveLength(1)
    expect(requestsOf('listTutoringSessions')).toHaveLength(1)

    await page.find('.ws-tutor-inline-close').trigger('click')
    expect(page.find('.ws-tutor-inline').exists()).toBe(false)
  })

  it('发送求助前先保存最新内容，并以保存后的 revision 请求 AI', async () => {
    const page = await openWorkspace()
    await page.find('textarea.workspace-editor').setValue('AI_LATEST_CODE')
    await openTutor(page)
    await page.find('.ws-tutor-inline textarea[placeholder="描述现象与具体疑问"]').setValue('这段代码为什么没生效？')
    await page.find('.ws-tutor-inline form.composer').trigger('submit')
    await flushPromises()

    const saves = requestsOf('saveWorkspace')
    expect(saves).toHaveLength(1)
    expect((bodyOf(saves[0]!)['files'] as { content: string }[])[0]?.content).toBe('AI_LATEST_CODE')
    const sends = requestsOf('sendTutoringMessage')
    expect(sends).toHaveLength(1)
    expect(bodyOf(sends[0]!)['workspaceRevision']).toBe(2)
    expect(scripted.requests.indexOf(saves[0]!)).toBeLessThan(scripted.requests.indexOf(sends[0]!))
  })

  it('最新修改保存失败时不发送求助，并在侧边栏内提示原因', async () => {
    saveFails = true
    const page = await openWorkspace()
    await page.find('textarea.workspace-editor').setValue('WILL_NOT_SAVE')
    await openTutor(page)
    await page.find('.ws-tutor-inline textarea[placeholder="描述现象与具体疑问"]').setValue('先保存再问我')
    await page.find('.ws-tutor-inline form.composer').trigger('submit')
    await flushPromises()

    expect(requestsOf('sendTutoringMessage')).toHaveLength(0)
    expect(page.find('.ws-tutor-inline .field-error').text()).toContain('最新修改尚未保存，暂不能请求 AI 辅导。')
  })
})
