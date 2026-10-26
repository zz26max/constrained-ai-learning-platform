import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 顶栏未读数：外壳只读、只渲染徽标，不发请求。
    数据由已加载它的页面写入——消息页（`listMessages` 的 `summary.unreadCount`）与
    学习首页（`getDashboard` 的 `unreadMessageCount`）；未知时保持 null，不显示 0 徽标。 */
export const useNotificationsStore = defineStore('notifications', () => {
  const unread = ref<number | null>(null)
  function setUnread(value: number | null | undefined): void {
    unread.value = typeof value === 'number' ? value : null
  }
  function reset(): void {
    unread.value = null
  }
  return { unread, setUnread, reset }
})
