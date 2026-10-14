import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, watch } from 'vue'
import { createMemoryHistory, createRouter, RouterView, useRoute } from 'vue-router'
import { registerAuthApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { ApiClient, ApiError } from '../src/api/client'
import { useAuthStore } from '../src/stores/auth'
import { usePageQuery } from '../src/features/courses/use-page-query'
import { createScriptedTransport, DEMO_USER } from './helpers'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

async function pageHarness(first: Promise<string>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const scripted = createScriptedTransport()
  registerAuthApi(new AuthApi(new ApiClient(scripted.transport)))
  useAuthStore().$patch({ phase: 'authenticated', bootStatus: 'success', identity: { ...DEMO_USER, roles: [...DEMO_USER.roles] }, csrfToken: 'csrf-test' })
  const signals: AbortSignal[] = []
  const Page = defineComponent({
    setup() {
      const route = useRoute()
      const query = usePageQuery(async signal => {
        signals.push(signal)
        // This transport intentionally ignores abort. Generation checks must
        // still reject an old response after the same page instance is reused.
        return route.params.chapterId === 'first' ? first : '当前章节'
      })
      watch(() => route.params.chapterId, () => { void query.load() }, { immediate: true })
      return () => h('section', [h('h1', query.data.value ?? ''), h('p', { role: 'status' }, query.status.value), query.error.value ? h('p', { role: 'alert' }, query.error.value.message) : null])
    },
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/course/:offeringId/chapter/:chapterId', component: Page }] })
  await router.push('/course/offering/chapter/first')
  await router.isReady()
  wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), { global: { plugins: [pinia, router] } })
  await flushPromises()
  await router.push('/course/offering/chapter/second')
  await flushPromises()
  return { router, signals, rendered: wrapper }
}

describe('P1-A 页面请求生命周期', () => {
  it('完整章节路径切换后，旧读取晚到不会覆盖当前章节', async () => {
    const old = deferred<string>()
    const { signals, rendered, router } = await pageHarness(old.promise)
    expect(signals[0]?.aborted).toBe(true)
    expect(rendered.find('h1').text()).toBe('当前章节')
    old.resolve('上一课程的旧章节')
    await flushPromises()
    expect(router.currentRoute.value.params).toEqual({ offeringId: 'offering', chapterId: 'second' })
    expect(rendered.find('h1').text()).toBe('当前章节')
    expect(rendered.find('[role="status"]').text()).toBe('success')
  })

  it('旧请求晚到404时，不把已经成功的当前章节改成错误页', async () => {
    const old = deferred<string>()
    const { rendered } = await pageHarness(old.promise)
    old.reject(new ApiError({ status: 404, code: 'NOT_FOUND', message: '旧章节不存在', requestId: 'req-old-chapter' }))
    await flushPromises()
    expect(rendered.find('h1').text()).toBe('当前章节')
    expect(rendered.find('[role="alert"]').exists()).toBe(false)
    expect(rendered.find('[role="status"]').text()).toBe('success')
  })
})
