import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent, h, type Component } from 'vue'
import RegisterPage from '../src/features/auth/RegisterPage.vue'
import { registerAuthApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient } from '../src/api/client'
import {
  createScriptedTransport,
  okEnvelope,
  failEnvelope,
  type ScriptedTransport,
} from './helpers'

const HomeStub: Component = defineComponent({
  name: 'HomeStub',
  setup: () => () => h('div', 'home-stub'),
})

const LoginStub: Component = defineComponent({
  name: 'LoginStub',
  setup: () => () => h('div', 'login-stub'),
})

let router: Router
let scripted: ScriptedTransport
const mounted: ReturnType<typeof mount>[] = []
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

async function mountRegisterPage(): Promise<ReturnType<typeof mount>> {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'register', path: '/register', component: RegisterPage },
      { name: 'login', path: '/login', component: LoginStub },
      { name: 'student-home', path: '/student/home', component: HomeStub },
      { name: 'teacher-home', path: '/teacher', component: HomeStub },
    ],
  })
  router.push('/register')
  await router.isReady()
  const wrapper = mount(RegisterPage, { attachTo: document.body, global: { plugins: [createPinia(), router] } })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  scripted = createScriptedTransport()
  registerAuthApi(new AuthApi(new ApiClient(scripted.transport)))
})

describe('注册页（RegisterPage）', () => {
  describe('页面渲染', () => {
    it('渲染标题和返回登录链接', async () => {
      scripted.setHandler(() => okEnvelope({ csrfToken: 'csrf-t1' }))
      const wrapper = await mountRegisterPage()
      
      expect(wrapper.find('h1').text()).toBe('创建账号')
      const loginLink = wrapper.find('a[href="/login"]')
      expect(loginLink.exists()).toBe(true)
      expect(loginLink.text()).toContain('登录')
    })

    it('第一步显示用户名、显示名称和密码字段', async () => {
      scripted.setHandler(() => okEnvelope({ csrfToken: 'csrf-t1' }))
      const wrapper = await mountRegisterPage()
      
      expect(wrapper.find('#register-username').exists()).toBe(true)
      expect(wrapper.find('#register-display-name').exists()).toBe(true)
      expect(wrapper.find('#register-password').exists()).toBe(true)
      expect(wrapper.find('#register-confirm-password').exists()).toBe(true)
    })

    it('显示下一步按钮', async () => {
      scripted.setHandler(() => okEnvelope({ csrfToken: 'csrf-t1' }))
      const wrapper = await mountRegisterPage()
      
      const nextButton = wrapper.find('button.primary')
      expect(nextButton.exists()).toBe(true)
      expect(nextButton.text()).toBe('下一步')
    })
  })
})


async function fillBasic(wrapper: ReturnType<typeof mount>, username = 'newuser') {
  await wrapper.get('#register-username').setValue(username)
  await wrapper.get('#register-display-name').setValue('新用户')
  await wrapper.get('#register-password').setValue('Password123')
  await wrapper.get('#register-confirm-password').setValue('Password123')
}

describe('注册步骤与纠错回归', () => {
  it('大写用户名和空白姓名在第一步拦截，不发送注册请求', async () => {
    const wrapper = await mountRegisterPage()
    await fillBasic(wrapper, 'NewUser')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('h1').text()).toBe('创建账号')
    expect(wrapper.text()).toContain('小写字母')
    await wrapper.get('#register-username').setValue('newuser')
    await wrapper.get('#register-display-name').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('h1').text()).toBe('创建账号')
    expect(scripted.requests).toHaveLength(0)
  })

  it('Enter逐步前进，用户名冲突返回第一步并保留输入与焦点', async () => {
    scripted.setHandler(request => request.operationId === 'register'
      ? failEnvelope(400, 'USERNAME_TAKEN') : okEnvelope({ csrfToken: 'csrf-t1' }))
    const wrapper = await mountRegisterPage()
    await fillBasic(wrapper)
    await wrapper.get('#register-confirm-password').trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('h1').text()).toBe('选择学习模式')
    expect(scripted.requests).toHaveLength(0)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.register-eyebrow').text()).toBe('步骤 3 / 3')
    expect(scripted.requests).toHaveLength(0)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('创建账号')
    expect((wrapper.get('#register-username').element as HTMLInputElement).value).toBe('newuser')
    expect((wrapper.get('#register-password').element as HTMLInputElement).value).toBe('Password123')
    expect(document.activeElement?.id).toBe('register-username')
    expect(scripted.requests.filter(request => request.operationId === 'register')).toHaveLength(1)
  })

  it('学校分支不因Enter跳过角色选择，无效邀请码保留在可纠错步骤', async () => {
    scripted.setHandler(request => request.operationId === 'register'
      ? failEnvelope(400, 'INVALID_INVITE_CODE') : okEnvelope({ csrfToken: 'csrf-t1' }))
    const wrapper = await mountRegisterPage()
    await fillBasic(wrapper)
    await wrapper.get('form').trigger('submit')
    await wrapper.findAll('.mode-option')[1]!.trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('h1').text()).toBe('学校模式 - 选择角色')
    expect(scripted.requests).toHaveLength(0)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.register-eyebrow').text()).toBe('步骤 4 / 4')
    await wrapper.get('#register-invite-code').setValue('INVALID')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(document.activeElement?.id).toBe('register-invite-code')
    expect((wrapper.get('#register-invite-code').element as HTMLInputElement).value).toBe('INVALID')
  })
})
