import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
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
  return mount(RegisterPage, { global: { plugins: [createPinia(), router] } })
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
