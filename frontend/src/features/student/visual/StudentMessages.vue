<script setup lang="ts">
import ApiState from '../../../components/ApiState.vue'
import ActionNotice from '../../../components/ActionNotice.vue'
import { beijingDay } from '../../../features/calendar/dates'
import { formatTime } from '../../../features/courses/format'
import { MESSAGE_FILTERS, MESSAGE_TYPE_LABELS, useMessageInbox } from '../../notifications/use-message-inbox'
import type { NotificationDTO } from '../../../api/assignments'

// 消息行为（列表/筛选/分页/标读/跳转/徽标）由 useMessageInbox 共享，本组件只保留视觉壳。
const {
  currentPage, messageFilter, query, notifications, unreadCount, totalPages,
  listElement, clippedIds, measureOverflow, actions, navigateError, courseById,
  markRead, canOpen, open, goToPage,
} = useMessageInbox({ withCourses: true })
const messageFilters = MESSAGE_FILTERS
const TYPE_LABELS = MESSAGE_TYPE_LABELS as Record<NotificationDTO['type'], string>

const today = beijingDay(new Date())
const yesterday = beijingDay(new Date(Date.now() - 86400000))
function dayLabel(day: string): string {
  if (day === today) return '今天'
  if (day === yesterday) return '昨天'
  return `${Number(day.slice(5, 7))} 月 ${Number(day.slice(8))} 日`
}
const clock = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
function openLabel(type: NotificationDTO['type']): string {
  return type === 'feedback' ? '查看评价' : type === 'assignment_published' ? '查看作业' : type === 'course_notice' ? '查看公告' : '查看内容'
}
</script>

<template>
  <div class="workspace-page sr-messages">
    <header class="page-head">
      <div>
        <h1 class="page-title" tabindex="-1">消息通知</h1>
        <p v-if="query.status.value === 'success'" class="page-summary">{{ unreadCount > 0 ? `${unreadCount} 条未读` : '全部已读' }}</p>
      </div>
    </header>

    <nav class="filter-tabs" aria-label="消息筛选"><button v-for="f in messageFilters" :key="f.key" :aria-pressed="messageFilter===f.key" @click="messageFilter=f.key">{{f.label}}</button></nav>

    <ApiState v-if="!query.data.value || query.status.value === 'error'" :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <ActionNotice :error="actions.error.value ?? navigateError" :message="actions.message.value" />

    <section v-if="query.data.value" aria-label="消息列表">
      <p v-if="notifications.length === 0" class="empty-state">没有符合条件的消息。切换筛选条件查看其他消息。</p>

      <ul v-else ref="listElement" class="msg-list">
        <template v-for="(notification,index) in notifications" :key="notification.id">
        <li v-if="index===0 || beijingDay(notifications[index-1]!.createdAt)!==beijingDay(notification.createdAt)" class="notification-date"><h2>{{ dayLabel(beijingDay(notification.createdAt)) }}<small v-if="index===0 && currentPage>1"> · 本页</small></h2></li>
        <li
          class="notification-item" :data-message-id="notification.id" :data-notification-type="notification.type"
          :class="{ unread: notification.readAt === null }"
        >
          <div class="grow">
            <span class="kind">{{ TYPE_LABELS[notification.type] }}<template v-if="courseById(notification.offeringId)"> · {{ courseById(notification.offeringId)!.title }}</template><template v-if="notification.sender"> · {{ notification.sender.displayName }}</template></span>
            <h3 class="notification-title" tabindex="-1" :title="notification.title">{{ notification.title }}</h3>
            <p class="notification-content">{{ notification.content }}</p>
            <details v-if="clippedIds.has(notification.id)" class="message-full" @toggle="measureOverflow"><summary><span class="message-expand">完整消息</span><span class="message-collapse">收起消息</span><span aria-hidden="true">⌄</span></summary><p>{{notification.content}}</p></details>
          </div>
          <div class="m-side">
            <time class="notification-time" :datetime="notification.createdAt" :title="formatTime(notification.createdAt)">{{ clock(notification.createdAt) }}</time>
            <span v-if="notification.readAt === null" class="unread-tag">未读</span>
            <button v-if="canOpen(notification)" type="button" class="quiet-link" @click="open(notification)">{{ openLabel(notification.type) }}</button>
            <button v-if="notification.readAt === null" type="button" class="quiet-btn" :disabled="actions.pending.value" @click="markRead(notification)">标为已读</button>
          </div>
        </li></template>
      </ul>

      <nav v-if="totalPages > 1" class="pagination" aria-label="消息分页">
        <span class="meta">第 {{ currentPage }} / {{ totalPages }} 页</span>
        <span class="pager"><button type="button" class="button secondary" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">上一页</button><button type="button" class="button secondary" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">下一页</button></span>
      </nav>
    </section>
  </div>
</template>
