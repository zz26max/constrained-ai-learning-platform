<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { assignmentsApi } from '../../api'
import type { NotificationDTO } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { pageError, type PageError } from '../courses/page-error'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from '../assignments/use-assignment-actions'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const api = assignmentsApi()
const auth = useAuthStore()
const actions = useAssignmentActions()

const currentPage = ref(1)
const pageSize = 20
const navigateError = shallowRef<PageError | null>(null)

const query = usePageQuery(async signal => {
  const result = await api.listMessages({ page: currentPage.value, pageSize }, { signal })
  return result.data
})

watch(currentPage, () => { void query.load() })
watch(() => auth.identity?.id, () => {
  currentPage.value = 1
  void query.load()
}, { immediate: true })

const notifications = computed(() => query.data.value?.items ?? [])
const unreadCount = computed(() => query.data.value?.summary.unreadCount ?? 0)
const totalPages = computed(() => Math.ceil((query.data.value?.total ?? 0) / pageSize))

const TYPE_LABELS: Record<NotificationDTO['type'], string> = {
  course_notice: '课程公告',
  assignment_published: '作业发布',
  feedback: '教师反馈',
  system: '系统通知',
  help_reply: '求助回复',
}

async function markRead(notification: NotificationDTO): Promise<void> {
  if (notification.readAt !== null) return
  const result = await actions.run(token => api.readMessage(notification.id, { csrfToken: token }), '已标为已读')
  if (result !== null) await query.load()
}

function canOpen(notification: NotificationDTO): boolean {
  const type = notification.target?.type
  return type === 'assignment' || type === 'offering' || type === 'feedback'
}

async function open(notification: NotificationDTO): Promise<void> {
  const target = notification.target
  if (target === null) return
  navigateError.value = null
  try {
    if (target.type === 'assignment') {
      await router.push({ name: 'student-assignment', params: { id: target.id } })
    } else if (target.type === 'offering') {
      await router.push({ name: 'course', params: { offeringId: target.id } })
    } else if (target.type === 'feedback') {
      const feedback = await api.getFeedback(target.id)
      await router.push({ name: 'student-assignment', params: { id: feedback.data.assignmentId } })
    }
  } catch (cause) {
    navigateError.value = await pageError(cause)
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function goToPage(page: number): void {
  if (page >= 1 && page <= totalPages.value) currentPage.value = page
}
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">消息</h1>
        <p v-if="query.status.value === 'success'" class="muted">{{ unreadCount }} 条未读</p>
      </div>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <ActionNotice :error="actions.error.value ?? navigateError" :message="actions.message.value" />

    <section v-if="query.status.value === 'success'" class="surface" aria-label="消息列表">
      <p v-if="notifications.length === 0" class="muted empty-state">暂无消息</p>

      <ul v-else class="notification-list">
        <li
          v-for="notification in notifications"
          :key="notification.id"
          class="notification-item"
          :class="{ unread: notification.readAt === null }"
        >
          <div class="notification-header">
            <span class="notification-type">{{ TYPE_LABELS[notification.type] }}</span>
            <span v-if="notification.readAt === null" class="tag">未读</span>
            <time class="notification-time" :datetime="notification.createdAt">{{ formatTime(notification.createdAt) }}</time>
          </div>
          <h2 class="notification-title">{{ notification.title }}</h2>
          <p class="notification-content">{{ notification.content }}</p>
          <div class="notification-actions">
            <button
              v-if="canOpen(notification)"
              type="button"
              class="button secondary"
              @click="open(notification)"
            >
              查看
            </button>
            <button
              v-if="notification.readAt === null"
              type="button"
              class="button secondary"
              :disabled="actions.pending.value"
              @click="markRead(notification)"
            >
              标为已读
            </button>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" class="pagination" aria-label="消息分页">
        <button type="button" class="button secondary" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">上一页</button>
        <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
        <button type="button" class="button secondary" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">下一页</button>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.empty-state { padding: 3rem; text-align: center; }
.notification-list { display: flex; flex-direction: column; gap: 0.5rem; list-style: none; margin: 0; padding: 0; }
.notification-item { padding: 1rem; border: 1px solid var(--border, #e0e0e0); border-radius: 0.5rem; }
.notification-item.unread { background-color: var(--surface-highlight, #e3f2fd); border-left: 4px solid var(--primary, #0066cc); }
.notification-header { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.5rem; }
.notification-type { font-size: 0.875rem; font-weight: 600; color: var(--primary, #0066cc); }
.notification-time { margin-left: auto; font-size: 0.875rem; color: var(--text-muted, #666); }
.notification-title { font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem; }
.notification-content { font-size: 0.875rem; margin: 0; white-space: pre-wrap; }
.notification-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border, #e0e0e0); }
.page-info { font-size: 0.875rem; color: var(--text-muted, #666); }
</style>
