<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { assignmentsApi } from '../../api'
import type { NotificationDTO } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const api = assignmentsApi()
const auth = useAuthStore()

const currentPage = ref(1)
const pageSize = 20

const query = usePageQuery(async signal => {
  const result = await api.getNotifications(
    { page: currentPage.value, pageSize },
    { signal }
  )
  return result.data
})

watch(currentPage, () => query.load())
watch(() => auth.identity?.id, () => {
  currentPage.value = 1
  void query.load()
}, { immediate: true })

const notifications = computed(() => query.data.value?.items ?? [])
const unreadCount = computed(() => query.data.value?.unreadCount ?? 0)
const totalPages = computed(() => {
  const total = query.data.value?.total ?? 0
  return Math.ceil(total / pageSize)
})

async function handleNotificationClick(notification: NotificationDTO) {
  if (!notification.isRead) {
    try {
      const token = await auth.ensureCsrfToken()
      await api.markNotificationRead(notification.id, { csrfToken: token })
      await query.load()
    } catch (error) {
      console.error('Failed to mark notification as read', error)
    }
  }

  if (notification.relatedAssignmentId) {
    await router.push({
      name: 'student-assignment',
      params: { id: notification.relatedAssignmentId }
    })
  } else if (notification.relatedOfferingId) {
    await router.push({
      name: 'course',
      params: { offeringId: notification.relatedOfferingId }
    })
  }
}

function getNotificationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    feedback_published: '反馈发布',
    assignment_published: '作业发布',
    offering_archived: '教学班归档'
  }
  return labels[type] ?? type
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 7) return `${diffDays}天前`
  return date.toLocaleDateString('zh-CN')
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">通知中心</h1>
        <p v-if="unreadCount > 0" class="muted">{{ unreadCount }} 条未读</p>
      </div>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <section v-if="query.status.value === 'success'" class="surface">
      <div v-if="notifications.length === 0" class="empty-state">
        <p class="muted">暂无通知</p>
      </div>

      <div v-else class="notification-list">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          class="notification-item"
          :class="{ unread: !notification.isRead }"
          @click="handleNotificationClick(notification)"
        >
          <div class="notification-header">
            <span class="notification-type">{{ getNotificationTypeLabel(notification.type) }}</span>
            <span class="notification-time">{{ formatDate(notification.createdAt) }}</span>
          </div>
          <h3 class="notification-title">{{ notification.title }}</h3>
          <p class="notification-content">{{ notification.content }}</p>
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button
          class="button secondary"
          :disabled="currentPage === 1"
          @click="goToPage(currentPage - 1)"
        >
          上一页
        </button>
        <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
        <button
          class="button secondary"
          :disabled="currentPage === totalPages"
          @click="goToPage(currentPage + 1)"
        >
          下一页
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.empty-state {
  padding: 3rem;
  text-align: center;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notification-item {
  padding: 1rem;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.notification-item:hover {
  background-color: var(--surface-secondary, #f5f5f5);
}

.notification-item.unread {
  background-color: var(--surface-highlight, #e3f2fd);
  border-left: 4px solid var(--primary, #0066cc);
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.notification-type {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary, #0066cc);
}

.notification-time {
  font-size: 0.875rem;
  color: var(--text-muted, #666);
}

.notification-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.notification-content {
  font-size: 0.875rem;
  color: var(--text-secondary, #333);
  margin: 0;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border, #e0e0e0);
}

.page-info {
  font-size: 0.875rem;
  color: var(--text-muted, #666);
}
</style>
