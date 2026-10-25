import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, RouterView } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import {
  mockTransport, resetMockAssignmentState, resetMockAuthState, resetMockCookies,
  resetMockCourseState, resetMockDashboardState, resetMockFeedbackState, resetMockTutoringState,
} from '../src/mocks/index'
import { ApiClient } from '../src/api/client'
import { AuthApi } from '../src/api/auth'
import { TutoringApi } from '../src/api/tutoring'
import { registerAuthApi, registerTutoringApi } from '../src/api'
import { createAppRouter } from '../src/app/router'
import { useAuthStore } from '../src/stores/auth'
import type { TransportRequest } from '../src/api/transport'

let csrf = ''

async function call(operationId: string, method: TransportRequest['method'], path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> {
  const response = await mockTransport.request({
    operationId, method, path,
    headers: token ? { 'X-CSRF-Token': token } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: JSON.parse(response.bodyText) }
}

async function loginAs(username: string): Promise<void> {
  const pre = await call('getCsrfToken', 'GET', '/api/v1/auth/csrf')
  const result = await call('login', 'POST', '/api/v1/auth/login', { username, password: 'mock-demo-pass' }, pre.body.data.csrfToken)
  csrf = result.body.data.csrfToken
}

const HELP_ID = '00000000-0000-4000-8000-000000000911'

beforeAll(() => {
  registerAuthApi(new AuthApi(new ApiClient(mockTransport)))
  registerTutoringApi(new TutoringApi(new ApiClient(mockTransport)))
})

beforeEach(() => {
  resetMockAuthState()
  resetMockCookies()
  resetMockCourseState()
  resetMockAssignmentState()
  resetMockFeedbackState()
  resetMockDashboardState()
  resetMockTutoringState()
  csrf = ''
})

describe('教师求助详情页：登出清空数据时不得崩溃（回归：Missing required param 冻结渲染）', () => {
  it('身份清空后重渲染无未捕获错误，返回链接随数据一并卸载', async () => {
    await loginAs('teacher.demo')
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.phase = 'authenticated'
    auth.csrfToken = csrf
    auth.identity = { id: '00000000-0000-4000-8000-000000000002', username: 'teacher.demo', displayName: '演示教师', roles: ['teacher'] } as never

    const router = createAppRouter(createMemoryHistory())
    const wrapper = mount(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [pinia, router] } })

    const rejections: string[] = []
    const onRejection = (event: PromiseRejectionEvent) => rejections.push(event.reason?.message ?? String(event.reason))
    window.addEventListener('unhandledrejection', onRejection)

    await router.push(`/teacher/help-requests/${HELP_ID}`)
    await flushPromises()
    expect(wrapper.text()).toContain('窄屏溢出仍未解决')

    // 模拟登出：身份清空触发 use-page-query 的同步 watch，将页面数据置空并重渲染。
    auth.identity = null
    await nextTick()
    await flushPromises()
    await nextTick()

    expect(rejections).toEqual([])
    window.removeEventListener('unhandledrejection', onRejection)
    wrapper.unmount()
  })
})
