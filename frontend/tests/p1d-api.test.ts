import { beforeEach, describe, expect, it } from 'vitest'
import mainSource from '../src/main.ts?raw'
import {
  assignmentsApi, createDefaultAssignmentsApi, createDefaultDashboardApi, createDefaultNoticesApi,
  createDefaultStatsApi, dashboardApi, noticesApi, registerAssignmentsApi, registerDashboardApi,
  registerNoticesApi, registerStatsApi, statsApi,
} from '../src/api'
import { ApiClient, ApiError } from '../src/api/client'
import { DashboardApi } from '../src/api/dashboard'
import { NoticesApi } from '../src/api/notices'
import { StatsApi } from '../src/api/stats'
import { createScriptedTransport, failEnvelope, okEnvelope, type ScriptedTransport } from './helpers'

const OFFERING = '00000000-0000-4000-8000-000000000201'
const STUDENT = '00000000-0000-4000-8000-000000000001'
const ASSIGNMENT = '00000000-0000-4000-8000-000000000701'
const NOTICE = '00000000-0000-4000-8000-000000000901'

let scripted: ScriptedTransport
let dashboard: DashboardApi
let notices: NoticesApi
let stats: StatsApi

beforeEach(() => {
  scripted = createScriptedTransport()
  scripted.setHandler(() => okEnvelope({}))
  const client = new ApiClient(scripted.transport)
  dashboard = new DashboardApi(client)
  notices = new NoticesApi(client)
  stats = new StatsApi(client)
})

function last() {
  const request = scripted.requests.at(-1)
  if (request === undefined) throw new Error('没有发出请求')
  return request
}

describe('DashboardApi 契约请求', () => {
  it('getDashboard：GET /me/dashboard，termId 作为查询参数，无 CSRF', async () => {
    await dashboard.getDashboard({ termId: '00000000-0000-4000-8000-000000000011' })
    expect(last()).toMatchObject({ operationId: 'getDashboard', method: 'GET', path: '/api/v1/me/dashboard?termId=00000000-0000-4000-8000-000000000011' })
    expect(last().headers['X-CSRF-Token']).toBeUndefined()
    expect(last().body).toBeUndefined()
  })

  it('getDashboard：不传 termId 时路径不带查询串', async () => {
    await dashboard.getDashboard()
    expect(last().path).toBe('/api/v1/me/dashboard')
  })

  it('getMyLearningRecords：路径含 offeringId，发送分页参数，无 CSRF', async () => {
    await dashboard.getMyLearningRecords(OFFERING, { page: 3, pageSize: 10 })
    expect(last()).toMatchObject({ operationId: 'getMyLearningRecords', method: 'GET', path: `/api/v1/me/offerings/${OFFERING}/learning-records?page=3&pageSize=10` })
    expect(last().headers['X-CSRF-Token']).toBeUndefined()
  })

  it('markMessagesAsRead：PUT 空对象请求体，带 CSRF，type 为可选查询参数', async () => {
    await dashboard.markMessagesAsRead(OFFERING, { type: 'feedback' }, { csrfToken: 'csrf-1' })
    expect(last()).toMatchObject({ operationId: 'markMessagesAsRead', method: 'PUT', path: `/api/v1/me/offerings/${OFFERING}/messages/mark-read?type=feedback` })
    expect(last().body).toBe('{}')
    expect(last().headers['X-CSRF-Token']).toBe('csrf-1')
    expect(last().headers['Content-Type']).toBe('application/json')

    await dashboard.markMessagesAsRead(OFFERING, {}, { csrfToken: 'csrf-1' })
    expect(last().path).toBe(`/api/v1/me/offerings/${OFFERING}/messages/mark-read`)
  })

  it('markMessagesAsRead：缺 CSRF 令牌时不发请求', async () => {
    await expect(dashboard.markMessagesAsRead(OFFERING)).rejects.toThrow('CSRF')
    expect(scripted.requests).toHaveLength(0)
  })

  it('不再暴露契约之外的旧方法', () => {
    expect('getLearningRecords' in dashboard).toBe(false)
    expect('markMessagesRead' in dashboard).toBe(false)
  })
})

describe('NoticesApi 契约请求', () => {
  it('listNotices：GET 班级公告分页，page/pageSize 为查询参数', async () => {
    await notices.listNotices(OFFERING, { page: 2, pageSize: 10 })
    expect(last()).toMatchObject({ operationId: 'listNotices', method: 'GET', path: `/api/v1/offerings/${OFFERING}/notices?page=2&pageSize=10` })
    expect(last().headers['X-CSRF-Token']).toBeUndefined()
  })

  it('listNotices：不传分页时不拼查询串', async () => {
    await notices.listNotices(OFFERING)
    expect(last().path).toBe(`/api/v1/offerings/${OFFERING}/notices`)
  })

  it('getNotice：GET /notices/{noticeId}', async () => {
    await notices.getNotice(NOTICE)
    expect(last()).toMatchObject({ operationId: 'getNotice', method: 'GET', path: `/api/v1/notices/${NOTICE}` })
  })

  it('createNotice：POST 教师端点，body 使用 target 字段，带 CSRF', async () => {
    const target = { type: 'assignment', id: ASSIGNMENT, offeringId: OFFERING } as const
    await notices.createNotice(OFFERING, { title: '提醒', content: '请按时提交', target }, { csrfToken: 'csrf-2' })
    expect(last()).toMatchObject({ operationId: 'createNotice', method: 'POST', path: `/api/v1/teacher/offerings/${OFFERING}/notices` })
    expect(JSON.parse(last().body ?? '{}')).toEqual({ title: '提醒', content: '请按时提交', target })
    expect(last().headers['X-CSRF-Token']).toBe('csrf-2')
  })

  it('createNotice：缺 CSRF 令牌时不发请求', async () => {
    await expect(notices.createNotice(OFFERING, { title: 't', content: 'c' })).rejects.toThrow('CSRF')
    expect(scripted.requests).toHaveLength(0)
  })

  it('不暴露 planned 的 listTeacherNotices', () => {
    expect('listTeacherNotices' in notices).toBe(false)
  })

  it('路径参数会被编码', async () => {
    await notices.getNotice('a/b')
    expect(last().path).toBe('/api/v1/notices/a%2Fb')
  })
})

describe('StatsApi 契约请求', () => {
  it('getOfferingStats：GET 教师端班级统计', async () => {
    await stats.getOfferingStats(OFFERING)
    expect(last()).toMatchObject({ operationId: 'getOfferingStats', method: 'GET', path: `/api/v1/teacher/offerings/${OFFERING}/stats` })
    expect(last().headers['X-CSRF-Token']).toBeUndefined()
  })

  it('getAssignmentStats：GET 教师端作业统计', async () => {
    await stats.getAssignmentStats(ASSIGNMENT)
    expect(last()).toMatchObject({ operationId: 'getAssignmentStats', method: 'GET', path: `/api/v1/teacher/assignments/${ASSIGNMENT}/stats` })
  })

  it('getStudentLearningRecords：两个路径参数依次替换，分页为查询参数', async () => {
    await stats.getStudentLearningRecords(OFFERING, STUDENT, { page: 3, pageSize: 5 })
    expect(last()).toMatchObject({
      operationId: 'getStudentLearningRecords', method: 'GET',
      path: `/api/v1/teacher/offerings/${OFFERING}/students/${STUDENT}/learning-records?page=3&pageSize=5`,
    })
  })

  it('错误响应保持结构化 ApiError，而不是空数据', async () => {
    scripted.setHandler(() => failEnvelope(403, 'FORBIDDEN', {}, 'req-forbidden'))
    await expect(stats.getOfferingStats(OFFERING)).rejects.toSatisfy((error: unknown) =>
      error instanceof ApiError && error.status === 403 && error.code === 'FORBIDDEN' && error.requestId === 'req-forbidden')
  })
})

describe('应用启动注册路径（main.ts）', () => {
  it('createDefault* 在真实模式下返回对应客户端，register 后 getter 可取', async () => {
    registerAssignmentsApi(await createDefaultAssignmentsApi())
    registerDashboardApi(await createDefaultDashboardApi())
    registerNoticesApi(await createDefaultNoticesApi())
    registerStatsApi(await createDefaultStatsApi())
    expect(() => assignmentsApi()).not.toThrow()
    expect(dashboardApi()).toBeInstanceOf(DashboardApi)
    expect(noticesApi()).toBeInstanceOf(NoticesApi)
    expect(statsApi()).toBeInstanceOf(StatsApi)
  })

  it('main.ts 实际注册了全部业务客户端', () => {
    for (const name of ['Auth', 'Courses', 'Assignments', 'Dashboard', 'Notices', 'Stats']) {
      expect(mainSource).toContain(`register${name}Api(await createDefault${name}Api())`)
    }
  })
})
