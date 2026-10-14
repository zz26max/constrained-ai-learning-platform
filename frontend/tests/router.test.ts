import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, type Router } from 'vue-router'
import { registerAuthApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import { createAppRouter } from '../src/app/router'
import { useAuthStore } from '../src/stores/auth'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, okEnvelope, operationIds, type ScriptedTransport } from './helpers'

let scripted: ScriptedTransport

function setAuthenticated(role: 'student' | 'teacher'): void {
  useAuthStore().$patch({
    phase: 'authenticated',
    bootStatus: 'success',
    identity: { ...DEMO_USER, roles: [role] },
    config: { ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] },
    csrfToken: 'csrf-router',
  })
}

async function newRouter(path: string): Promise<Router> {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  return router
}

beforeEach(() => {
  setActivePinia(createPinia())
  scripted = createScriptedTransport()
  registerAuthApi(new AuthApi(new ApiClient(scripted.transport)))
})

describe('P1-A 路由守卫', () => {
  it('学生访问教师路由落到 access-denied', async () => {
    setAuthenticated('student')
    const router = await newRouter('/teacher/offerings/00000000-0000-4000-8000-000000000201')
    expect(router.currentRoute.value.name).toBe('access-denied')
  })

  it('教师访问学生课程路由落到 access-denied', async () => {
    setAuthenticated('teacher')
    const router = await newRouter('/course/00000000-0000-4000-8000-000000000201')
    expect(router.currentRoute.value.name).toBe('access-denied')
  })

  it('未登录访问受保护路由带 return 参数回登录页', async () => {
    useAuthStore().$patch({ phase: 'anonymous', bootStatus: 'success' })
    const router = await newRouter('/teacher/offerings/00000000-0000-4000-8000-000000000201')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.return).toBe('/teacher/offerings/00000000-0000-4000-8000-000000000201')
  })

  it('已登录访问 login 按角色回落到对应入口', async () => {
    setAuthenticated('teacher')
    const teacherRouter = await newRouter('/login')
    expect(teacherRouter.currentRoute.value.path).toBe('/teacher')

    setActivePinia(createPinia())
    setAuthenticated('student')
    const studentRouter = await newRouter('/login')
    expect(studentRouter.currentRoute.value.path).toBe('/course')
  })

  it('bootStatus 为 error 时导航会调用重试并继续分流', async () => {
    scripted.setHandler((request) => {
      switch (request.operationId) {
        case 'getCsrfToken': return okEnvelope({ csrfToken: 'csrf-after-boot-retry' })
        case 'getMe': return okEnvelope({ ...DEMO_USER, roles: [...DEMO_USER.roles] })
        case 'getConfig': return okEnvelope({ ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] })
        default: throw new Error(`未脚本化操作：${request.operationId}`)
      }
    })
    useAuthStore().$patch({ phase: 'booting', bootStatus: 'error' })

    const router = await newRouter('/course')

    expect(router.currentRoute.value.name).toBe('courses')
    expect(useAuthStore().bootStatus).toBe('success')
    expect(useAuthStore().phase).toBe('authenticated')
    expect(operationIds(scripted.requests)).toEqual(['getCsrfToken', 'getMe', 'getConfig'])
  })
})
