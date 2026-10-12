import { nextTick } from 'vue'
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import LoginPage from '../features/auth/LoginPage.vue'
import SessionPanel from '../features/auth/SessionPanel.vue'
import NotFoundPage from '../features/NotFoundPage.vue'
import { useAuthStore } from '../stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    requiresAuth?: boolean
    title?: string
  }
}

/** 站内返回路径只接受同应用内部路由，不把外部输入当跳转目标。 */
export function isInternalPath(value: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9\-._~/]*$/.test(value)
}

const routes: RouteRecordRaw[] = [
  {
    name: 'login',
    path: '/login',
    component: LoginPage,
    meta: { public: true, title: '登录 · 学习空间' },
  },
  {
    name: 'session',
    path: '/',
    component: SessionPanel,
    meta: { requiresAuth: true, title: '学习空间 · 会话联调页' },
  },
  {
    name: 'not-found',
    path: '/:pathMatch(.*)*',
    component: NotFoundPage,
    meta: { title: '页面不存在 · 学习空间' },
  },
]

export const router = createRouter({
  // FRONTEND.md 1：hash 模式；路由配置 path 不带 #，命名路由 params 传参。
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // 首次进入任一页面先恢复会话；刷新浏览器可直接恢复登录态（P0-A 验收链）。
  if (auth.bootStatus === 'idle') {
    await auth.ensureBoot()
  }
  if (to.meta.requiresAuth === true && auth.phase !== 'authenticated') {
    const returnQuery = to.query.return
    const query =
      typeof returnQuery === 'string' && isInternalPath(returnQuery) ? { return: returnQuery } : {}
    return { name: 'login', query }
  }
  if (to.name === 'login' && auth.phase === 'authenticated') {
    const ret = to.query.return
    return typeof ret === 'string' && isInternalPath(ret) ? ret : '/'
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta.title
  if (typeof title === 'string') {
    document.title = title
  }
  // 切页聚焦标题（FRONTEND.md 9）；标题均带 tabindex="-1"。
  void nextTick(() => {
    const heading = document.querySelector<HTMLElement>('main h1')
    heading?.focus({ preventScroll: false })
  })
})
