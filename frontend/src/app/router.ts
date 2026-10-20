import { nextTick } from 'vue'
import { createRouter, createWebHashHistory, type RouteRecordRaw, type RouterHistory } from 'vue-router'
import LoginPage from '../features/auth/LoginPage.vue'
import SessionPanel from '../features/auth/SessionPanel.vue'
import NotFoundPage from '../features/NotFoundPage.vue'
import { useAuthStore } from '../stores/auth'
import type { components } from '../api/generated/schema'
import AccessDeniedPage from './AccessDeniedPage.vue'
import CourseListPage from '../features/student/visual/StudentCourses.vue'
import OfferingPage from '../features/courses/OfferingPage.vue'
import ChapterPage from '../features/courses/ChapterPage.vue'
import ResourcePage from '../features/courses/ResourcePage.vue'
import TeacherOfferingsPage from '../features/teacher/TeacherOfferingsPage.vue'
import TeacherOfferingPage from '../features/teacher/TeacherOfferingPage.vue'
import AssignmentList from '../features/student/visual/StudentAssignments.vue'
import AssignmentDetail from '../features/assignments/AssignmentDetail.vue'
import WorkspaceEditor from '../features/assignments/WorkspaceEditor.vue'
import AssignmentManagement from '../features/assignments/AssignmentManagement.vue'
import AssignmentEditor from '../features/assignments/AssignmentEditor.vue'
import TeacherFeedbackEditor from '../features/assignments/TeacherFeedbackEditor.vue'
import NotificationCenter from '../features/student/visual/StudentMessages.vue'
import StudentHomePage from '../features/student/visual/StudentHome.vue'
import LearningRecordsPage from '../features/student/visual/StudentRecords.vue'
import NoticeListPage from '../features/notices/NoticeListPage.vue'
import NoticeDetailPage from '../features/notices/NoticeDetailPage.vue'
import AssignmentCalendar from '../features/calendar/AssignmentCalendar.vue'
import StudentCalendar from '../features/student/visual/StudentCalendar.vue'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    requiresAuth?: boolean
    title?: string
    requiresRole?: 'student' | 'teacher'
  }
}

/** 站内返回路径只接受同应用内部路由，不把外部输入当跳转目标。 */
export function isInternalPath(value: string): boolean {
  // 仅允许固定首页方案恢复；不放宽任意查询参数或外部返回地址。
  return /^\/(?!\/)[A-Za-z0-9\-._~/]*$/.test(value) || /^\/student\/home\?design=(?:a|b|bplus|current)$/.test(value)
}

export function defaultEntry(user: components['schemas']['UserDTO'] | null): string {
  if (user?.roles.includes('teacher')) return '/teacher'
  if (user?.roles.includes('student')) return '/student/home'
  return '/debug/session'
}

const routes: RouteRecordRaw[] = [
  {name:'student-calendar',path:'/student/calendar',component:StudentCalendar,meta:{requiresAuth:true,requiresRole:'student',title:'学习日历 · 知学'}},
  {name:'teacher-calendar',path:'/teacher/calendar',component:AssignmentCalendar,meta:{requiresAuth:true,requiresRole:'teacher',title:'教学日历 · 知学'}},
  {
    name: 'login',
    path: '/login',
    component: LoginPage,
    meta: { public: true, title: '登录 · 学习空间' },
  },
  {
    path: '/',
    redirect: () => useAuthStore().phase === 'authenticated' ? defaultEntry(useAuthStore().identity) : '/login',
  },
  {
    name: 'session',
    path: '/debug/session',
    component: SessionPanel,
    meta: { requiresAuth: true, title: '学习空间 · 会话联调页' },
  },
  { name: 'student-home', path: '/student/home', component: StudentHomePage, meta: { requiresAuth: true, requiresRole: 'student', title: '首页 · 学习空间' } },
  { name: 'student-progress-select', path: '/student/progress', component: LearningRecordsPage, meta: { requiresAuth: true, requiresRole: 'student', title: '学习记录 · 学习空间' } },
  { name: 'student-progress', path: '/student/progress/:offeringId', component: LearningRecordsPage, meta: { requiresAuth: true, requiresRole: 'student', title: '学习记录 · 学习空间' } },
  { name: 'student-notices', path: '/student/offerings/:offeringId/notices', component: NoticeListPage, meta: { requiresAuth: true, requiresRole: 'student', title: '课程公告 · 学习空间' } },
  { name: 'student-notice', path: '/student/notices/:noticeId', component: NoticeDetailPage, meta: { requiresAuth: true, requiresRole: 'student', title: '公告详情 · 学习空间' } },
  { name: 'courses', path: '/course', component: CourseListPage, meta: { requiresAuth: true, requiresRole: 'student', title: '我的课程 · 学习空间' } },
  { name: 'course', path: '/course/:offeringId', component: OfferingPage, meta: { requiresAuth: true, requiresRole: 'student', title: '课程详情 · 学习空间' } },
  { name: 'chapter', path: '/course/:offeringId/chapter/:chapterId', component: ChapterPage, meta: { requiresAuth: true, requiresRole: 'student', title: '章节阅读 · 学习空间' } },
  { name: 'resource', path: '/resource/:resourceId', component: ResourcePage, meta: { requiresAuth: true, requiresRole: 'student', title: '学习资料 · 学习空间' } },
  { name: 'student-assignments', path: '/student/assignments', component: AssignmentList, meta: { requiresAuth: true, requiresRole: 'student', title: '我的作业 · 学习空间' } },
  { name: 'student-assignment', path: '/student/assignments/:id', component: AssignmentDetail, meta: { requiresAuth: true, requiresRole: 'student', title: '作业详情 · 学习空间' } },
  { name: 'student-workspace', path: '/student/workspaces/:id', component: WorkspaceEditor, meta: { requiresAuth: true, requiresRole: 'student', title: '工作区 · 学习空间' } },
  { name: 'student-messages', path: '/student/messages', component: NotificationCenter, meta: { requiresAuth: true, requiresRole: 'student', title: '消息 · 学习空间' } },
  { name: 'teacher-feedback', path: '/teacher/submissions/:submissionId/feedback', component: TeacherFeedbackEditor, meta: { requiresAuth: true, requiresRole: 'teacher', title: '批阅作业 · 学习空间' } },
  { name: 'teacher', path: '/teacher', component: TeacherOfferingsPage, meta: { requiresAuth: true, requiresRole: 'teacher', title: '教学班 · 学习空间' } },
  { name: 'teacher-offering', path: '/teacher/offerings/:id', component: TeacherOfferingPage, meta: { requiresAuth: true, requiresRole: 'teacher', title: '教学工作台 · 学习空间' } },
  { name: 'teacher-assignments', path: '/teacher/offerings/:offeringId/assignments', component: AssignmentManagement, meta: { requiresAuth: true, requiresRole: 'teacher', title: '作业管理 · 学习空间' } },
  { name: 'teacher-assignment', path: '/teacher/assignments/:id', component: AssignmentEditor, meta: { requiresAuth: true, requiresRole: 'teacher', title: '编辑作业 · 学习空间' } },
  { name: 'teacher-assignment-new', path: '/teacher/offerings/:offeringId/assignments/new', component: AssignmentEditor, meta: { requiresAuth: true, requiresRole: 'teacher', title: '创建作业 · 学习空间' } },
  { name: 'access-denied', path: '/access-denied', component: AccessDeniedPage, meta: { requiresAuth: true, title: '权限不足 · 学习空间' } },
  {
    name: 'not-found',
    path: '/:pathMatch(.*)*',
    component: NotFoundPage,
    meta: { title: '页面不存在 · 学习空间' },
  },
]

export function createAppRouter(history: RouterHistory = createWebHashHistory()) {
const router = createRouter({
  // FRONTEND.md 1：hash 模式；路由配置 path 不带 #，命名路由 params 传参。
  history,
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // 首次进入任一页面先恢复会话；刷新浏览器可直接恢复登录态（P0-A 验收链）。
  if (auth.bootStatus === 'idle') {
    await auth.ensureBoot()
  } else if (auth.bootStatus === 'error') {
    await auth.retryBoot()
  }
  if (to.meta.requiresAuth === true && auth.phase !== 'authenticated') {
    const query = isInternalPath(to.fullPath) ? { return: to.fullPath } : {}
    return { name: 'login', query }
  }
  if (to.name === 'login' && auth.phase === 'authenticated') {
    const ret = to.query.return
    return typeof ret === 'string' && isInternalPath(ret) ? ret : defaultEntry(auth.identity)
  }
  if (to.meta.requiresRole && !auth.identity?.roles.includes(to.meta.requiresRole)) return { name: 'access-denied' }
  return true
})
router.afterEach((to, _from, failure) => {
  if (failure) return
  const title = to.meta.title
  if (typeof title === 'string') {
    document.title = title.replaceAll('学习空间', '知学')
  }
  // 切页聚焦标题（FRONTEND.md 9）；标题均带 tabindex="-1"。
  void nextTick(() => {
    const heading = document.querySelector<HTMLElement>('main h1')
    heading?.focus({ preventScroll: false })
  })
})
return router
}

export const router = createAppRouter()
