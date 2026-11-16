import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { registerAuthApi, registerCoursesApi, registerTutoringApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { CoursesApi } from '../src/api/courses'
import { TutoringApi } from '../src/api/tutoring'
import TutoringPanel from '../src/features/tutoring/TutoringPanel.vue'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_USER, failEnvelope, okEnvelope, type ScriptHandler, type ScriptedResponse } from './helpers'

const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const ASSIGNMENT = uuid(701)
const OTHER_ASSIGNMENT = uuid(702)
const OFFERING = uuid(703)
const SESSION_A = uuid(704)
const SESSION_B = uuid(705)
const OTHER_SESSION = uuid(706)
const REQUEST = uuid(707)
const DATE = '2026-11-16T02:00:00Z'

const session = (id: string, assignmentId = ASSIGNMENT) => ({
  id, assignmentId, createdAt: DATE, lastMessageAt: null, status: 'active', pendingRequestId: null,
})
const message = (sequence: number, content: string, role = 'assistant') => ({
  id: uuid(1000 + sequence), sequence, role, content, createdAt: DATE,
  citations: [], mode: role === 'assistant' ? 'concept' : null, hintLevel: role === 'assistant' ? 1 : null,
})
const messagesPage = (path: string, items: ReadonlyArray<ReturnType<typeof message>>) => {
  const query = new URL(path, 'http://localhost').searchParams
  const page = Number(query.get('page') ?? 1)
  const pageSize = Number(query.get('pageSize') ?? 20)
  return okEnvelope({ page, pageSize, total: items.length, items: items.slice((page - 1) * pageSize, page * pageSize) })
}
const accepted: ScriptedResponse = { status: 202, body: { data: { tutoringRequestId: REQUEST, status: 'queued' }, requestId: 'req-accepted' } }
const requestStatus = (status: 'running' | 'completed' | 'failed', error: { code: string; message: string } | null = null) =>
  okEnvelope({ id: REQUEST, sessionId: SESSION_A, status, result: null, error, createdAt: DATE, completedAt: status === 'running' ? null : DATE })

function deferredResponse() {
  let resolve!: (response: ScriptedResponse) => void
  const promise = new Promise<ScriptedResponse>(finish => { resolve = finish })
  return { promise, resolve }
}

let scripted: ReturnType<typeof createScriptedTransport>
let panel: VueWrapper | undefined
let auth: ReturnType<typeof useAuthStore>

function normalResponse(request: Parameters<ScriptHandler>[0]): ScriptedResponse {
  switch (request.operationId) {
    case 'getAiPolicy': return okEnvelope({
      assignmentId: ASSIGNMENT, enabled: true, requireAttemptFromLevel: 2, maxHintLevel: 3,
      boundaryText: '帮助检查思路', restrictCompleteSolution: true, allowCodeBlocks: false,
      dailyAssignmentLimit: 12, perMinuteLimit: 3,
    })
    case 'getOffering': return okEnvelope({ id: OFFERING, teachers: [] })
    case 'listTutoringSessions': {
      const items = request.path.includes(OTHER_ASSIGNMENT)
        ? [session(OTHER_SESSION, OTHER_ASSIGNMENT)]
        : [session(SESSION_A), session(SESSION_B)]
      return okEnvelope({ items, page: 1, pageSize: 20, total: items.length })
    }
    case 'listTutoringMessages': return messagesPage(request.path, [])
    default: return failEnvelope(404, 'NOT_FOUND')
  }
}

async function openPanel(handler: ScriptHandler) {
  scripted.setHandler(handler)
  const pinia = createPinia()
  setActivePinia(pinia)
  auth = useAuthStore()
  auth.$patch({ phase: 'authenticated', bootStatus: 'success', identity: { ...DEMO_USER, roles: ['student'] }, csrfToken: 'csrf-student' })
  panel = mount(TutoringPanel, {
    props: { assignmentId: ASSIGNMENT, offeringId: OFFERING },
    global: { plugins: [pinia], stubs: { RouterLink: true } },
    attachTo: document.body,
  })
  await flushPromises()
  return panel
}

const selectSession = (page: VueWrapper, index: number) => page.findAll('.session-btn')[index]!.trigger('click')
const question = (page: VueWrapper) => page.get<HTMLTextAreaElement>('.composer textarea')
const chat = (page: VueWrapper) => page.get('.chat')

beforeEach(() => {
  scripted = createScriptedTransport()
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
  registerTutoringApi(new TutoringApi(client))
})

afterEach(() => {
  panel?.unmount()
  panel = undefined
  vi.useRealTimers()
})

describe('长对话与会话切换', () => {
  it('先呈现尾部两页，读取更早消息时也能接上跨页的新回复', async () => {
    vi.useFakeTimers()
    const history = Array.from({ length: 150 }, (_, index) => message(index + 1, `旧消息 ${index + 1}`))
    const earlier = deferredResponse()
    const page = await openPanel(request => {
      if (request.operationId === 'listTutoringMessages') {
        const { searchParams } = new URL(request.path, 'http://localhost')
        if (searchParams.get('page') === '1' && history.length > 150) return earlier.promise
        return messagesPage(request.path, history)
      }
      if (request.operationId === 'sendTutoringMessage') {
        history.push(message(151, '跨页的新问题', 'student'))
        return accepted
      }
      if (request.operationId === 'getTutoringRequest') {
        history.push(message(152, '跨页的新回复'))
        return requestStatus('completed')
      }
      return normalResponse(request)
    })
    const messageTexts = () => chat(page).findAll('.msg-text').map(item => item.text())
    expect(messageTexts()).toHaveLength(100)
    expect(messageTexts()[0]).toBe('旧消息 51')
    expect(messageTexts().at(-1)).toBe('旧消息 150')
    await question(page).setValue('跨页的新问题')
    await page.get('form.composer').trigger('submit')
    await flushPromises()
    expect(messageTexts()).toContain('跨页的新问题')
    await page.get('.earlier-messages').trigger('click')
    expect(page.get('.earlier-messages').text()).toContain('正在加载')
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(messageTexts().at(-1)).toBe('跨页的新回复')
    expect(messageTexts()).toHaveLength(102)
    earlier.resolve(messagesPage('?page=1&pageSize=50', history))
    await flushPromises()
    expect(messageTexts()).toHaveLength(152)
    expect(messageTexts()[0]).toBe('旧消息 1')
    expect(messageTexts().at(-1)).toBe('跨页的新回复')
    expect(page.find('.earlier-messages').exists()).toBe(false)
  })

  it('慢读取和已受理的旧会话发送都不覆盖新会话，草稿分别保留', async () => {
    vi.useFakeTimers()
    const lateRead = deferredResponse()
    const lateSend = deferredResponse()
    let readsB = 0
    const page = await openPanel(request => {
      if (request.operationId === 'sendTutoringMessage') return lateSend.promise
      if (request.operationId === 'listTutoringMessages') {
        if (request.path.includes(SESSION_A)) return messagesPage(request.path, [message(1, '甲历史')])
        if (++readsB === 1) return lateRead.promise
        return messagesPage(request.path, [message(2, '乙历史')])
      }
      if (request.operationId === 'getTutoringRequest') return requestStatus('completed')
      return normalResponse(request)
    })
    await question(page).setValue('发在甲会话')
    await page.get('form.composer').trigger('submit')
    await flushPromises()
    expect(scripted.requests.find(request => request.operationId === 'sendTutoringMessage')?.path).toContain(SESSION_A)

    await selectSession(page, 1)
    expect(chat(page).text()).toContain('正在加载')
    expect(chat(page).text()).not.toContain('甲历史')
    await selectSession(page, 0)
    lateRead.resolve(messagesPage('', [message(2, '迟到的乙历史')]))
    await flushPromises()
    expect(chat(page).text()).toContain('甲历史')
    expect(chat(page).text()).not.toContain('迟到的乙历史')

    await selectSession(page, 1)
    await flushPromises()
    expect(chat(page).text()).toContain('乙历史')
    await question(page).setValue('乙会话的独立草稿')
    lateSend.resolve(accepted)
    await flushPromises()
    expect(chat(page).find('.pending').exists()).toBe(false)
    expect(question(page).element.value).toBe('乙会话的独立草稿')

    await selectSession(page, 0)
    expect(chat(page).find('.pending').exists()).toBe(true)
    expect(question(page).element.value).toBe('')
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(chat(page).find('.pending').exists()).toBe(false)
    await selectSession(page, 1)
    expect(question(page).element.value).toBe('乙会话的独立草稿')
  })

  it('409 从请求详情确认会话归属，失败提示留在该会话', async () => {
    vi.useFakeTimers()
    let checks = 0
    const page = await openPanel(request => {
      if (request.operationId === 'sendTutoringMessage') return failEnvelope(409, 'AI_REQUEST_IN_PROGRESS', { pendingRequestId: REQUEST })
      if (request.operationId === 'getTutoringRequest') {
        return ++checks === 1 ? requestStatus('running') : requestStatus('failed', { code: 'AI_UNAVAILABLE', message: '甲的请求暂时失败' })
      }
      return normalResponse(request)
    })
    await selectSession(page, 1)
    await question(page).setValue('乙还没成功发送的问题')
    await page.get('form.composer').trigger('submit')
    await flushPromises()
    expect(chat(page).find('.pending').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(chat(page).find('.pending').exists()).toBe(false)
    await selectSession(page, 0)
    expect(chat(page).get('.pending').text()).toContain('生成中')
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(page.get('form [role="alert"]').text()).toContain('甲的请求暂时失败')
    await selectSession(page, 1)
    expect(page.find('form [role="alert"]').exists()).toBe(false)
    expect(question(page).element.value).toBe('乙还没成功发送的问题')
  })

  it('等待登录令牌时切换作业，旧草稿和提交都留在原作业范围内', async () => {
    const csrf = deferredResponse()
    const page = await openPanel(request => request.operationId === 'getCsrfToken' ? csrf.promise : normalResponse(request))
    auth.csrfToken = null
    await question(page).setValue('旧作业的问题')
    await page.get('form.composer').trigger('submit')
    await page.setProps({ assignmentId: OTHER_ASSIGNMENT })
    await flushPromises()
    csrf.resolve(okEnvelope({ csrfToken: 'csrf-student' }))
    await flushPromises()
    expect(question(page).element.value).toBe('')
    expect(scripted.requests.some(request => request.operationId === 'sendTutoringMessage')).toBe(false)
  })
})
