import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent, h, type Component } from 'vue'
import LoginPage from '../src/features/auth/LoginPage.vue'
import { registerAuthApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import {
  createScriptedTransport,
  DEMO_CONFIG,
  DEMO_USER,
  failEnvelope,
  okEnvelope,
  operationIds,
  type ScriptHandler,
  type ScriptedTransport,
} from './helpers'

const SessionStub: Component = defineComponent({
  name: 'SessionStub',
  setup: () => () => h('div', 'session-stub'),
})

const RegisterStub: Component = defineComponent({
  name: 'RegisterStub',
  setup: () => () => h('div', 'register-stub'),
})

let router: Router
let scripted: ScriptedTransport

function happyAuthScript(): ScriptHandler {
  return (request) => {
    switch (request.operationId) {
      case 'getCsrfToken':
        return okEnvelope({ csrfToken: 'csrf-t1' })
      case 'login':
        return okEnvelope({ user: { ...DEMO_USER, roles: [...DEMO_USER.roles] }, csrfToken: 'csrf-t2' })
      case 'getMe':
        return okEnvelope({ ...DEMO_USER, roles: [...DEMO_USER.roles] })
      case 'getConfig':
        return okEnvelope({ ...DEMO_CONFIG, terms: [...DEMO_CONFIG.terms] })
      default:
        throw new Error(`未脚本化操作：${request.operationId}`)
    }
  }
}

async function mountLoginPage(): Promise<ReturnType<typeof mount>> {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'login', path: '/login', component: LoginPage },
      { name: 'session', path: '/', component: SessionStub },
      { name: 'register', path: '/register', component: RegisterStub },
    ],
  })
  router.push('/login')
  await router.isReady()
  return mount(LoginPage, { global: { plugins: [createPinia(), router] } })
}

beforeEach(() => {
  scripted = createScriptedTransport()
  registerAuthApi(new AuthApi(new ApiClient(scripted.transport)))
})

async function submitLogin(
  wrapper: ReturnType<typeof mount>,
  username: string,
  password: string,
): Promise<void> {
  await wrapper.find('#login-username').setValue(username)
  await wrapper.find('#login-password').setValue(password)
  await wrapper.find('form.auth-form').trigger('submit')
  await flushPromises()
}

describe('登录页（LoginPage）', () => {
  it('渲染标题、两个输入与登录按钮', async () => {
    scripted.setHandler(happyAuthScript())
    const wrapper = await mountLoginPage()
    expect(wrapper.find('h1').text()).toBe('登录')
    expect(wrapper.find('#login-username').exists()).toBe(true)
    expect(wrapper.find('#login-password').exists()).toBe(true)
    const submit = wrapper.find('button[type="submit"]')
    expect(submit.exists()).toBe(true)
    expect(submit.text()).toBe('登录')
  })

  it('凭据错误：显示错误提示并保留在登录页', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'login') return failEnvelope(401, 'INVALID_CREDENTIALS')
      return happyAuthScript()(request)
    })
    const wrapper = await mountLoginPage()
    await submitLogin(wrapper, 'student.demo', 'wrong')
    const notice = wrapper.find('[role="alert"]')
    expect(notice.text()).toContain('用户名或密码错误')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('CSRF 校验失败：提示重新提交，令牌只刷新一次且不重放登录', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'login') return failEnvelope(403, 'CSRF_INVALID')
      return happyAuthScript()(request)
    })
    const wrapper = await mountLoginPage()
    await submitLogin(wrapper, 'student.demo', 'mock-demo-pass')
    const notice = wrapper.find('[role="alert"]')
    expect(notice.text()).toContain('登录令牌已刷新')
    // 一次取令牌 + 一次共享刷新；登录只发出一次（不自动重放）
    expect(operationIds(scripted.requests)).toEqual(['getCsrfToken', 'login', 'getCsrfToken'])
  })

  it('输入校验失败：显示字段级错误', async () => {
    scripted.setHandler((request) => {
      if (request.operationId === 'login') {
        return failEnvelope(422, 'VALIDATION_ERROR', {
          fields: [
            { field: 'username', message: '用户名不能为空。' },
            { field: 'password', message: '密码不能为空。' },
          ],
        })
      }
      return happyAuthScript()(request)
    })
    const wrapper = await mountLoginPage()
    await submitLogin(wrapper, '', '')
    const errors = wrapper.findAll('.field-error')
    expect(errors.map((item) => item.text())).toEqual(['用户名不能为空。', '密码不能为空。'])
  })

  it('登录成功：恢复站内返回路径', async () => {
    scripted.setHandler(happyAuthScript())
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { name: 'login', path: '/login', component: LoginPage },
        { name: 'session', path: '/', component: SessionStub },
        { name: 'register', path: '/register', component: RegisterStub },
      ],
    })
    router.push('/login?return=/')
    await router.isReady()
    const wrapper = mount(LoginPage, { global: { plugins: [createPinia(), router] } })
    await submitLogin(wrapper, 'student.demo', 'mock-demo-pass')
    expect(router.currentRoute.value.path).toBe('/')
    expect(operationIds(scripted.requests)).toEqual(['getCsrfToken', 'login', 'getMe', 'getConfig'])
  })

  it('登录成功（无返回路径）：进入默认会话页', async () => {
    scripted.setHandler(happyAuthScript())
    const wrapper = await mountLoginPage()
    await submitLogin(wrapper, 'student.demo', 'mock-demo-pass')
    expect(router.currentRoute.value.path).toBe('/')
  })
})
