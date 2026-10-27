import { defineStore } from 'pinia'
import { ref } from 'vue'
import { assignmentsApi } from '../api'
import { useAuthStore } from './auth'

/** 顶栏未读数：外壳只读、只渲染徽标，不发请求。
    写入路径只有两条，且都以服务器结果为准：
    ① `refresh()`——用不带班级/类型筛选的 listMessages 小分页请求确认全局计数；
       后端 summary.unreadCount 受 offeringId/type 筛选影响，带筛选的列表计数是局部值，
       不得直接写入。并发调用去重，请求落地后新到的调用排尾随请求，保证读到已读之后的状态。
    ② 页面快照——首页 dashboard 与未带类型筛选的消息列表 summary。快照写入须携带
       发起时 `snapshotSeq()`，若此后已有更新的服务器确认则被否决，迟到响应不回退徽标。
    未知保持 null 不显示 0 徽标；失败保留原值，不把网络错误伪装成清零；登出/切账号 reset。 */
export const useNotificationsStore = defineStore('notifications', () => {
  const unread = ref<number | null>(null)
  let confirmedSeq = 0
  let inFlight: Promise<void> | null = null
  let queued = 0

  function setUnread(value: number | null | undefined, snapshotSeq = confirmedSeq): void {
    if (snapshotSeq < confirmedSeq) return
    unread.value = typeof value === 'number' ? value : null
  }

  /** 页面发起请求前取版本号，响应落地后回传给 setUnread 做陈旧判定。 */
  function snapshotSeq(): number {
    return confirmedSeq
  }

  function refresh(): Promise<void> {
    queued += 1
    if (inFlight === null) inFlight = drain()
    return inFlight
  }

  async function drain(): Promise<void> {
    try {
      while (queued > 0) {
        queued = 0
        const auth = useAuthStore()
        const accountId = auth.identity?.id
        try {
          const result = await assignmentsApi().listMessages({ page: 1, pageSize: 1, read: 'all' }, {})
          if (auth.identity?.id !== accountId) continue
          unread.value = result.data.summary.unreadCount
          confirmedSeq += 1
        } catch {
          // 读失败保留原值：徽标宁旧勿假；页面动作自身的错误另有 ActionNotice 展示。
        }
      }
    } finally {
      inFlight = null
    }
  }

  function reset(): void {
    unread.value = null
    confirmedSeq += 1
  }
  return { unread, setUnread, snapshotSeq, refresh, reset }
})
