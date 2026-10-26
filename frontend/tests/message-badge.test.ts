import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import { registerAuthApi, registerAssignmentsApi, registerCoursesApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { AssignmentsApi } from '../src/api/assignments'
import { CoursesApi } from '../src/api/courses'
import { useAuthStore } from '../src/stores/auth'
import { useNotificationsStore } from '../src/stores/notifications'
import {
  createScriptedTransport, DEMO_CONFIG, DEMO_USER, failEnvelope, okEnvelope,
  type ScriptedResponse, type ScriptedTransport,
} from './helpers'
import type { TransportRequest } from '../src/api/transport'

const OFFERING = '00000000-0000-4000-8000-000000000201'
const ASSIGNMENT = '00000000-0000-4000-8000-000000000701'
const M1 = '00000000-0000-4000-8000-000000000b01'
const M2 = '00000000-0000-4000-8000-000000000b02'
const M3 = '00000000-0000-4000-8000-000000000b03'

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined
// 消息服务端状态：readAt 为 null 视为未读；summary 只受 type 筛选影响，不受 read/分页影响。
let messages: Array<{ id: string; type: string; title: string; readAt: string | null }>
let readFailures = false

function dto(item: { id: string; type: string; title: string; readAt: string | null }) {
  return {
    id: item.id, type: item.type, title: item.title, content: `${item.title}内容`,
    target: item.type === 'assignment_published' ? { type: 'assignment', id: ASSIGNMENT, offeringId: OFFERING } : null,
    createdAt: '2026-10-14T02:00:00Z', readAt: item.readAt,
  }
}

function unreadCount(type?: string) {
  return messages.filter(item => item.readAt === null && (type === undefined || item.type === type)).length
}

function messagePage(page: number, pageSize: number, type?: string) {
  const items = messages
    .filter(item => type === undefined || item.type === type)
    .map(dto)
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page, pageSize, total: items.length,
    summary: { unreadCount: unreadCount(type) },
  }
}

function handleListMessages(request: TransportRequest): ScriptedResponse {
  const url = new URL('http://test' + request.path)
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
  const page = Number(url.searchParams.get('page') ?? 1)
  const type = url.searchParams.get('type') ?? undefined
  return okEnvelope(messagePage(page, pageSize, type))
}

function normalResponse(request: TransportRequest): ScriptedResponse {
  switch (request.operationId) {
    case 'listMessages': return handleListMessages(request)
    case 'listMyCourses': return okEnvelope({ items: [], page: 1, pageSize: 20, total: 0, summary: { allCount: 0, activeCount: 0, archivedCount: 0 } })
    case 'readMessage': {
      if (readFailures) return failEnvelope(500, 'INTERNAL_ERROR')
      const id = request.path.split('/').filter(Boolean).at(-2) ?? ''
      const item = messages.find(m => m.id === id)
      if (item) item.readAt = '2026-10-14T03:00:00Z'
      return okEnvelope(dto({ id, type: 'system', title: '已读', readAt: '2026-10-14T03:00:00Z' }))
    }
    default: throw new Error(`未脚本化操作：${request.operationId}`)
  }
}

function requestsOf(operationId: string) {
  return scripted.requests.filter(request => request.operationId === operationId)
}

function refreshRequests() {
  return requestsOf('listMessages').filter(request => request.path.includes('pageSize=1'))
}

async function open(path = '/student/messages'): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-student',
    identity: { ...DEMO_USER, roles: ['student'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
  })
  router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  wrapper = mount(App, { attachTo: document.body, props: { studentVisual: true }, global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

function badgeText(page: VueWrapper): string {
  return page.find('.topbar-unread').text()
}

beforeEach(() => {
  messages = [
    { id: M1, type: 'assignment_published', title: '新作业发布', readAt: null },
    { id: M2, type: 'feedback', title: '批阅已发布', readAt: null },
    { id: M3, type: 'course_notice', title: '周五测验', readAt: '2026-10-13T00:00:00Z' },
  ]
  readFailures = false
  scripted = createScriptedTransport()
  scripted.setHandler(normalResponse)
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

describe('生产消息页全局未读徽标（F1）', () => {
  it('深链直入 /student/messages 不经过首页也能显示全局未读数，未筛选时不发额外确认请求', async () => {
    const page = await open()
    expect(badgeText(page)).toBe('2')
    expect(page.find('.topbar-messages').attributes('aria-label')).toBe('消息通知，2 条未读')
    expect(page.text()).toContain('2 条未读')
    expect(requestsOf('listMessages')).toHaveLength(1)
    expect(requestsOf('listMessages')[0]?.path).toBe('/api/v1/me/messages?page=1&pageSize=20&read=all')
  })

  it('类型筛选后的局部计数不写入全局徽标，改由不带筛选的小分页请求确认', async () => {
    const page = await open()
    await page.find('.filter-tabs button:nth-child(4)').trigger('click')
    await flushPromises()
    // feedback 局部未读 = 1，但全局徽标保持 2
    expect(badgeText(page)).toBe('2')
    const refresh = refreshRequests()
    expect(refresh).toHaveLength(1)
    expect(refresh[0]?.path).toBe('/api/v1/me/messages?page=1&pageSize=1&read=all')
    expect(refresh[0]?.path).not.toContain('type=')
  })

  it('筛选下标读成功后徽标更新为刷新后的全局计数，列表页头显示局部计数', async () => {
    const page = await open()
    await page.find('.filter-tabs button:nth-child(4)').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('1 条未读')
    const buttons = page.findAll('.notification-item button').filter(b => b.text() === '标为已读')
    await buttons[0]!.trigger('click')
    await flushPromises()
    expect(requestsOf('readMessage')).toHaveLength(1)
    expect(badgeText(page)).toBe('1')
  })

  it('未筛选下标读成功由列表 summary 直接更新徽标，不产生额外确认请求', async () => {
    const page = await open()
    const buttons = page.findAll('.notification-item button').filter(b => b.text() === '标为已读')
    await buttons[0]!.trigger('click')
    await flushPromises()
    expect(badgeText(page)).toBe('1')
    expect(refreshRequests()).toHaveLength(0)
  })

  it('标读失败保留原计数并展示错误，不伪装成已读', async () => {
    const page = await open()
    readFailures = true
    const buttons = page.findAll('.notification-item button').filter(b => b.text() === '标为已读')
    await buttons[0]!.trigger('click')
    await flushPromises()
    expect(badgeText(page)).toBe('2')
    expect(page.text()).toContain('错误')
  })

  it('迟到的 dashboard 快照不会回退已被 refresh 确认的徽标', async () => {
    setActivePinia(createPinia())
    const store = useNotificationsStore()
    const staleSeq = store.snapshotSeq()
    await store.refresh()
    const confirmed = store.unread
    expect(confirmed).toBe(2)
    store.setUnread(99, staleSeq)
    expect(store.unread).toBe(confirmed)
    store.setUnread(1, store.snapshotSeq())
    expect(store.unread).toBe(1)
  })

  it('refresh 期间切换账号则丢弃结果，不跨账号写徽标', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.$patch({
      phase: 'authenticated', bootStatus: 'success', csrfToken: 'csrf-a',
      identity: { ...DEMO_USER, roles: ['student'] }, config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
    })
    let release: (() => void) | null = null
    const gate = new Promise<void>(resolve => { release = resolve })
    scripted.setHandler(async request => {
      if (request.operationId === 'listMessages') { await gate; return handleListMessages(request) }
      return normalResponse(request)
    })
    const client = new ApiClient(scripted.transport)
    registerAuthApi(new AuthApi(client))
    registerCoursesApi(new CoursesApi(client))
    registerAssignmentsApi(new AssignmentsApi(client))
    const store = useNotificationsStore()
    const pending = store.refresh()
    auth.$patch({ identity: { ...DEMO_USER, id: '00000000-0000-4000-8000-000000009999', roles: ['student'], displayName: '另一学生' } })
    release!()
    await pending
    expect(store.unread).toBeNull()
  })
})
