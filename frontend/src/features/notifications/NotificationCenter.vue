<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { beijingDay } from '../calendar/dates'
import { formatTime } from '../courses/format'
import { MESSAGE_FILTERS, MESSAGE_TYPE_LABELS, useMessageInbox } from './use-message-inbox'
import type { NotificationDTO } from '../../api/assignments'

// 消息行为（列表/筛选/分页/标读/跳转/徽标）由 useMessageInbox 共享，本组件只保留视觉壳。
const {
  currentPage, messageFilter, query, notifications, unreadCount, totalPages,
  listElement, clippedIds, measureOverflow, actions, navigateError,
  markRead, canOpen, open, goToPage,
} = useMessageInbox()
const messageFilters = MESSAGE_FILTERS
const TYPE_LABELS = MESSAGE_TYPE_LABELS as Record<NotificationDTO['type'], string>
</script>

<template>
  <div class="workspace-page student-inbox">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">消息通知</h1>
        <p v-if="query.status.value === 'success'" class="muted">{{ unreadCount }} 条未读</p>
      </div>
    </header>

    <nav class="filter-tabs" aria-label="消息筛选"><button v-for="f in messageFilters" :key="f.key" :aria-pressed="messageFilter===f.key" @click="messageFilter=f.key">{{f.label}}</button></nav>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <ActionNotice :error="actions.error.value ?? navigateError" :message="actions.message.value" />

    <section v-if="query.status.value === 'success'" class="surface" aria-label="消息列表">
      <p v-if="notifications.length === 0" class="muted empty-state">暂无消息</p>

      <ul v-else ref="listElement" class="notification-list">
        <template v-for="(notification,index) in notifications" :key="notification.id">
        <li v-if="index===0 || beijingDay(notifications[index-1]!.createdAt)!==beijingDay(notification.createdAt)" class="notification-date"><h2>{{beijingDay(notification.createdAt)}}<small v-if="index===0 && currentPage>1"> · 本页</small></h2></li>
        <li
          class="notification-item" :data-message-id="notification.id"
          :class="{ unread: notification.readAt === null }"
        >
          <div class="notification-header">
            <AppIcon :name="notification.type==='assignment_published'?'clipboard':notification.type==='feedback'?'chart':'bell'" :size="18" /><span class="notification-type">{{ TYPE_LABELS[notification.type] }}</span>
            <span v-if="notification.readAt === null" class="tag">● 未读</span><span v-else class="muted">已读</span>
            <time class="notification-time" :datetime="notification.createdAt">{{ formatTime(notification.createdAt) }}</time>
          </div>
          <h2 tabindex="-1" class="notification-title" :title="notification.title">{{ notification.title }}</h2>
          <p class="notification-content">{{ notification.content }}</p><details v-if="clippedIds.has(notification.id)" class="message-full" @toggle="measureOverflow"><summary><span class="message-expand">完整消息</span><span class="message-collapse">收起消息</span><span aria-hidden="true">⌄</span></summary><p>{{notification.content}}</p></details>
          <div class="notification-actions">
            <button
              v-if="canOpen(notification)"
              type="button"
              class="button secondary"
              @click="open(notification)"
            >
              {{ notification.type==='feedback'?'查看评价':notification.type==='assignment_published'?'查看作业':notification.type==='course_notice'?'查看公告':'查看内容' }}
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
        </li></template>
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
.notification-item { padding: 16px 0; border: 0; border-bottom:1px solid var(--line); border-radius:0; min-width:0; }
.notification-item.unread { background-color:transparent; border-left:3px solid var(--blue);padding-left:14px; }
.notification-header { display: flex; gap: 8px; flex-wrap:wrap; align-items: center; margin-bottom: 8px; }
.notification-type { font-size: 0.875rem; font-weight: 600; color: var(--primary, #0066cc); }
.notification-time { margin-left: auto; font-size: 0.875rem; color: var(--text-muted, #666); }
.notification-title { font-size:16px; font-weight:600; margin:0 0 6px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; }
.notification-content { font-size:14px; margin:0;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; }
.notification-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border, #e0e0e0); }
.page-info { font-size: 0.875rem; color: var(--text-muted, #666); }
</style>
