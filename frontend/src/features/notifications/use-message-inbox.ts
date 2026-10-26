import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { assignmentsApi, coursesApi } from '../../api'
import type { NotificationDTO } from '../../api/assignments'
import { allPages } from '../../api/pagination'
import { pageError, type PageError } from '../courses/page-error'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from '../assignments/use-assignment-actions'
import { useAuthStore } from '../../stores/auth'
import { useNotificationsStore } from '../../stores/notifications'
import { targetRoute } from './target-route'
import { useMessageOverflow } from './use-message-overflow'
import { isUuid } from '../assignments/format'

export const MESSAGE_TYPE_LABELS: Record<NotificationDTO['type'], string> = {
  course_notice: '课程公告',
  assignment_published: '作业发布',
  feedback: '教师反馈',
  system: '系统通知',
  help_reply: '求助回复',
}

export const MESSAGE_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'assignment_published', label: '作业' },
  { key: 'feedback', label: '评价' },
  { key: 'course_notice', label: '公告' },
] as const

export type MessageFilterKey = (typeof MESSAGE_FILTERS)[number]['key']

/** 消息中心共享行为：列表加载与筛选、分页、标读、目标跳转、错误处理与全局未读徽标。
    生产消息页与三个演示壳共享此实现，各页面只保留自己的模板与视觉规则。 */
export function useMessageInbox(options: { withCourses?: boolean } = {}) {
  const router = useRouter()
  const api = assignmentsApi()
  const auth = useAuthStore()
  const actions = useAssignmentActions()

  const currentPage = ref(1)
  const messageFilter = ref<MessageFilterKey>('all')
  const pageSize = 20
  const navigateError = shallowRef<PageError | null>(null)

  const classes = usePageQuery(async signal =>
    allPages((page, pageSize, signal) => coursesApi().listMyCourses({ page, pageSize, status: 'all' }, { signal }).then(r => r.data), signal))
  if (options.withCourses === true) void classes.load()
  function courseById(id: string | null) { return classes.data.value?.find(c => c.offeringId === id) }

  const query = usePageQuery(async signal => {
    const result = await api.listMessages({ page: currentPage.value, pageSize, read: messageFilter.value === 'unread' ? 'unread' : 'all', ...(['all', 'unread'].includes(messageFilter.value) ? {} : { type: messageFilter.value as 'assignment_published' | 'feedback' | 'course_notice' }) }, { signal })
    return result.data
  })

  watch(currentPage, () => { void query.load() })
  watch(messageFilter, () => { if (currentPage.value !== 1) currentPage.value = 1; else void query.load() })
  watch(() => auth.identity?.id, () => {
    currentPage.value = 1
    void query.load()
  }, { immediate: true })

  const notifications = computed(() => query.data.value?.items ?? [])
  const { listElement, clippedIds, measureOverflow } = useMessageOverflow(notifications)
  const unreadCount = computed(() => query.data.value?.summary.unreadCount ?? 0)
  const totalPages = computed(() => Math.ceil((query.data.value?.total ?? 0) / pageSize))

  // 全局徽标与列表页头是两个计数：后端 summary 只受 offeringId/type 筛选影响、不受 read 与分页影响。
  // 未带类型筛选时列表 summary 就是全局值，直接写入；带类型筛选时 summary 是局部值，
  // 只能经去重的 refresh() 以不带筛选的小分页请求确认，禁止把局部计数写进全局徽标。
  const badges = useNotificationsStore()
  const typeFiltered = computed(() => !['all', 'unread'].includes(messageFilter.value))
  watch(() => query.data.value?.summary.unreadCount, value => {
    if (typeof value === 'number' && !typeFiltered.value) badges.setUnread(value)
  }, { immediate: true })
  watch(typeFiltered, filtered => { if (filtered) void badges.refresh() })

  async function markRead(notification: NotificationDTO): Promise<void> {
    if (notification.readAt !== null) return
    const result = await actions.run(token => api.readMessage(notification.id, { csrfToken: token }), '已标为已读')
    if (result !== null) {
      await query.load()
      if (typeFiltered.value) void badges.refresh()
    }
  }

  function canOpen(notification: NotificationDTO): boolean {
    return notification.target !== null ? targetRoute(notification.target) !== null : isCourseNotice(notification)
  }

  function isCourseNotice(notification: NotificationDTO): boolean {
    return notification.type === 'course_notice' && isUuid(notification.offeringId)
  }

  async function open(notification: NotificationDTO): Promise<void> {
    const target = notification.target
    if (target === null) {
      if (isCourseNotice(notification)) {
        await router.push({ name: 'student-notices', params: { offeringId: notification.offeringId } })
        await markRead(notification)
      }
      return
    }
    const route = targetRoute(target)
    if (route === null) return
    navigateError.value = null
    try {
      if (route === 'needs-feedback-lookup') {
        const feedback = await api.getFeedback(target.id)
        await router.push({ name: 'student-assignment', params: { id: feedback.data.assignmentId }, query: { feedbackId: target.id } })
      } else {
        await router.push(route)
      }
      await markRead(notification)
    } catch (cause) {
      const failure = await pageError(cause)
      navigateError.value = failure.kind === 'not-found' || failure.kind === 'forbidden'
        ? { ...failure, message: '该内容已不可访问' }
        : failure
    }
  }

  function goToPage(page: number): void {
    if (page >= 1 && page <= totalPages.value) currentPage.value = page
  }

  return {
    currentPage, messageFilter, pageSize, query, actions, navigateError,
    notifications, listElement, clippedIds, measureOverflow, unreadCount, totalPages,
    typeFiltered, markRead, canOpen, isCourseNotice, open, goToPage, courseById,
  }
}
