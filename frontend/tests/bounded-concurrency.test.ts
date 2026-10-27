import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import { registerAuthApi, registerAssignmentsApi, registerCoursesApi, registerDashboardApi, registerTutoringApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { AssignmentsApi } from '../src/api/assignments'
import { CoursesApi } from '../src/api/courses'
import { DashboardApi } from '../src/api/dashboard'
import { TutoringApi } from '../src/api/tutoring'
import { ApiClient } from '../src/api/client'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, failEnvelope, okEnvelope, type ScriptedResponse, type ScriptedTransport } from './helpers'
import type { TransportRequest } from '../src/api/transport'

const uuid = (value: number) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
const OFFERING = uuid(201), CHAPTER = uuid(301), ASSIGNMENT = uuid(700)

// 并发与请求数观测：F6 验收要求以请求数量与最大并发为证据，不以主观"更快"表述。
let inflight = 0
let maxInflight = 0
let counts: Record<string, number>
const TRACKED = new Set(['getAssignment', 'listTutoringMessages'])

function trackingHandler(inner: (request: TransportRequest) => ScriptedResponse | Promise<ScriptedResponse>) {
  return async (request: TransportRequest): Promise<ScriptedResponse> => {
    counts[request.operationId] = (counts[request.operationId] ?? 0) + 1
    if (!TRACKED.has(request.operationId)) return inner(request)
    inflight += 1
    maxInflight = Math.max(maxInflight, inflight)
    try {
      await Promise.resolve()
      return await inner(request)
    } finally {
      inflight -= 1
    }
  }
}

let scripted: ScriptedTransport
let wrapper: VueWrapper | undefined
let router: Router | undefined
let handler: (request: TransportRequest) => ScriptedResponse | Promise<ScriptedResponse>

function summaryTask(id: string, title: string) {
  return {
    id, offeringId: OFFERING, offeringStatus: 'active', chapterId: CHAPTER, title,
    type: 'web_lab', isRequired: true, publicationState: 'published', description: '描述',
    dueAt: '2026-11-01T16:00:00Z', assignmentState: 'NOT_STARTED', overdue: false,
    latestSubmissionId: null, publishedFeedbackId: null, unreadFeedback: false,
  }
}

function taskList(ids: string[], prefix: string) {
  return {
    items: ids.map((id, index) => summaryTask(id, `${prefix} ${index + 1}`)),
    page: 1, pageSize: 100, total: ids.length,
    summary: { allCount: ids.length, todoCount: ids.length, doneCount: 0, archivedIncompleteCount: 0 },
  }
}

const detailFixture = (id: string, canSubmit: boolean) => ({
  id, offeringId: OFFERING, chapterId: CHAPTER, title: '任务', type: 'web_lab', isRequired: true,
  publicationState: 'published', description: '描述', dueAt: '2026-11-01T16:00:00Z',
  assignmentState: 'NOT_STARTED', overdue: false, latestSubmissionId: null, publishedFeedbackId: null,
  unreadFeedback: false, requirements: ['要求'], estimatedMinutes: 60, maxScore: 80,
  rubric: [{ criterionId: 'c1', title: '正确性', description: '实现正确', maxScore: 80 }],
  knowledgePointIds: [], lateUntil: null, allowResubmit: true, maxAttempts: 3, attemptsUsed: 0,
  canSubmit, submissionBlockedReason: null, aiPolicyVersion: null, offeringStatus: 'active',
})

const dashboardFixture = {
  termId: null, termLabel: '2026 秋', serverTime: '2026-10-26T02:00:00Z', courseCount: 1,
  pendingAssignmentCount: 10, unreadMessageCount: 2, currentLearning: null,
  recentFeedback: null, recentNotice: null,
}

const courseFixture = {
  items: [{ offeringId: OFFERING, title: '课程 A', groupName: '1 班', status: 'active', currentChapter: null, teachers: [], lastStudiedAt: null }],
  page: 1, pageSize: 100, total: 1,
}

async function open(path: string): Promise<VueWrapper> {
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

beforeEach(() => {
  inflight = 0
  maxInflight = 0
  counts = {}
  scripted = createScriptedTransport()
  scripted.setHandler(request => trackingHandler(handler)(request))
  const client = new ApiClient(scripted.transport)
  registerAuthApi(new AuthApi(client))
  registerCoursesApi(new CoursesApi(client))
  registerAssignmentsApi(new AssignmentsApi(client))
  registerDashboardApi(new DashboardApi(client))
  registerTutoringApi(new TutoringApi(client))
  handler = () => failEnvelope(500, 'INTERNAL_ERROR')
})

afterEach(() => {
  wrapper?.unmount()
  router?.options.history.destroy()
  wrapper = undefined
  router = undefined
  document.body.innerHTML = ''
})

describe('F6 首页待办的有界并发与单项降级', () => {
  it('10 项待办的详情请求以有界并发执行，单项失败降级为未确认计数而非整体报错', async () => {
    const ids = Array.from({ length: 10 }, (_, index) => uuid(1000 + index))
    handler = request => {
      switch (request.operationId) {
        case 'getDashboard': return okEnvelope(dashboardFixture)
        case 'listMyAssignments': return okEnvelope(taskList(ids, '任务'))
        case 'listMyCourses': return okEnvelope(courseFixture)
        case 'getAssignment': {
          const id = request.path.split('/').filter(Boolean).at(-1)!
          if (id === uuid(1007)) return failEnvelope(500, 'INTERNAL_ERROR')
          const canSubmit = id === uuid(1001) || id === uuid(1002)
          return okEnvelope(detailFixture(id, canSubmit))
        }
        default: return failEnvelope(404, 'NOT_FOUND')
      }
    }
    const page = await open('/student/home')
    // 优化前为串行瀑布：这里以最大并发与请求数为证据——并发不超过 6，全部 10 项都被确认。
    expect(maxInflight).toBeGreaterThan(1)
    expect(maxInflight).toBeLessThanOrEqual(6)
    expect(counts.getAssignment).toBe(10)
    // 可处理任务照常渲染（焦点卡给出“开始作答”），失败项以提示说明。
    expect(page.find('#explore-focus-title').exists()).toBe(true)
    expect(page.text()).toContain('开始作答')
    expect(page.text()).toContain('另有 1 项任务状态未能确认')
  })

  it('详情请求遇到 401 时不当作缺失吞掉：整体错误走会话恢复提示', async () => {
    const ids = Array.from({ length: 3 }, (_, index) => uuid(1010 + index))
    handler = request => {
      switch (request.operationId) {
        case 'getDashboard': return okEnvelope(dashboardFixture)
        case 'listMyAssignments': return okEnvelope(taskList(ids, '任务'))
        case 'listMyCourses': return okEnvelope(courseFixture)
        case 'getAssignment': return failEnvelope(401, 'UNAUTHENTICATED')
        case 'getMe': return okEnvelope({ ...DEMO_USER, roles: ['student'] })
        default: return failEnvelope(404, 'NOT_FOUND')
      }
    }
    const page = await open('/student/home')
    await flushPromises()
    const alert = page.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('重新登录')
  })
})

describe('F6 作业页分页/排序不重复全量加载', () => {
  it('todo 25 项：切页与排序不重新发起 getAssignment，切换筛选才重新加载', async () => {
    const ids = Array.from({ length: 25 }, (_, index) => uuid(1100 + index))
    handler = request => {
      switch (request.operationId) {
        case 'listMyAssignments': return okEnvelope(taskList(ids, '作业'))
        case 'listMyCourses': return okEnvelope(courseFixture)
        case 'getAssignment': {
          const id = request.path.split('/').filter(Boolean).at(-1)!
          return okEnvelope(detailFixture(id, true))
        }
        default: return failEnvelope(404, 'NOT_FOUND')
      }
    }
    await open('/student/assignments')
    expect(counts.getAssignment).toBe(25)

    await router!.push({ query: { page: '2' } })
    await flushPromises()
    expect(counts.getAssignment).toBe(25)

    await router!.push({ query: { page: '2', sort: 'desc' } })
    await flushPromises()
    expect(counts.getAssignment).toBe(25)

    // 筛选变化改变待办 ID 集合（all 在第 1 页取 20 项），重新加载属预期行为。
    await router!.push({ query: { status: 'all', sort: 'desc', page: '1' } })
    await flushPromises()
    expect(counts.getAssignment).toBe(45)
    expect(maxInflight).toBeLessThanOrEqual(6)
  })
})

describe('F6 求助页共享片段的有界加载与继续加载', () => {
  const session = (id: string) => ({ id, assignmentId: ASSIGNMENT, createdAt: '2026-10-24T10:00:00Z', status: 'closed' })

  function helpHandler(sessions: Array<{ id: string }>, total: number, page: number) {
    return (request: TransportRequest): ScriptedResponse | Promise<ScriptedResponse> => {
      switch (request.operationId) {
        case 'getAssignment': return okEnvelope(detailFixture(ASSIGNMENT, true))
        case 'getWorkspace': return okEnvelope({ assignmentId: ASSIGNMENT, revision: 2, files: [{ path: 'script.js', content: '// x' }], activeFile: 'script.js', savedAt: '2026-10-24T10:00:00Z', canSave: true, saveBlockedReason: null })
        case 'listTutoringSessions': return okEnvelope({ items: sessions, page, pageSize: 20, total })
        case 'listTutoringMessages': {
          const sessionId = request.path.split('/').filter(Boolean).at(-2)!
          return okEnvelope({
            items: [{ id: `m-${sessionId}`, sessionId, role: 'assistant', content: `观察：会话 ${sessionId.slice(-2)} 的边界情况。`, tutoringRequestId: `req-${sessionId}`, createdAt: '2026-10-24T10:00:00Z' }],
            page: 1, pageSize: 50, total: 1,
          })
        }
        default: return failEnvelope(404, 'NOT_FOUND')
      }
    }
  }

  it('点击加载更多会话：只拉取新增会话的消息，追加去重', async () => {
    const first = [uuid(901), uuid(902), uuid(903)].map(session)
    handler = request => {
      const pageParam = new URL('http://test' + request.path).searchParams.get('page')
      if (request.operationId === 'listTutoringSessions') {
        return pageParam === '2'
          ? okEnvelope({ items: [session(uuid(904)), session(uuid(905))], page: 2, pageSize: 20, total: 45 })
          : okEnvelope({ items: first, page: 1, pageSize: 20, total: 45 })
      }
      return helpHandler([], 45, 1)(request)
    }
    const page = await open(`/student/assignments/${ASSIGNMENT}/help`)
    expect(counts.listTutoringMessages).toBe(3)
    await page.findAll('button').find(button => button.text() === '加载更多会话')!.trigger('click')
    await flushPromises()
    expect(counts.listTutoringMessages).toBe(5)
    expect(page.findAll('.help-shares .help-check')).toHaveLength(5)
    expect(page.text()).toContain('仅显示最近 5 / 共 45 个会话')
    expect(maxInflight).toBeLessThanOrEqual(4)
  })

  it('共享片段加载失败时显示错误与重试，不伪装成"没有可共享的 AI 回复"', async () => {
    handler = request => {
      if (request.operationId === 'listTutoringSessions') return failEnvelope(500, 'INTERNAL_ERROR')
      if (request.operationId === 'getAssignment') return okEnvelope(detailFixture(ASSIGNMENT, true))
      if (request.operationId === 'getWorkspace') return okEnvelope({ assignmentId: ASSIGNMENT, revision: 2, files: [], activeFile: 'script.js', savedAt: null, canSave: true, saveBlockedReason: null })
      return failEnvelope(404, 'NOT_FOUND')
    }
    const page = await open(`/student/assignments/${ASSIGNMENT}/help`)
    expect(page.text()).toContain('AI 对话片段加载失败')
    expect(page.text()).not.toContain('还没有可共享')
  })
})
