/** v4 首页的状态与时间呈现：状态一个名字一种颜色、相对截止只做诚实描述。
    数据来源为 getDashboard 的 currentLearning / otherPendingAssignments（列表语义，
    无 canSubmit），能否提交的最终判断在作业详情页完成。 */

export type HomeTaskStateKey = 'NOT_STARTED' | 'IN_PROGRESS' | 'OVERDUE' | 'SUBMITTED' | 'REVIEWED'

export interface HomeTaskState {
  label: string
  tone: 'todo' | 'late' | 'closed' | 'wait' | 'done'
}

export const HOME_TASK_STATES: Record<HomeTaskStateKey, HomeTaskState> = {
  NOT_STARTED: { label: '未开始', tone: 'todo' },
  IN_PROGRESS: { label: '进行中', tone: 'todo' },
  OVERDUE: { label: '已逾期', tone: 'late' },
  SUBMITTED: { label: '已提交 · 待批阅', tone: 'wait' },
  REVIEWED: { label: '已批阅', tone: 'done' },
}

/** 列表语义只有 assignmentState + overdue：逾期且未提交的待办统一显示「已逾期」，
    能否补交要看详情的 canSubmit / lateUntil，首页不提前断言。 */
export function homeStateKey(task: { assignmentState: string; overdue: boolean }): HomeTaskStateKey {
  const pending = task.assignmentState === 'NOT_STARTED' || task.assignmentState === 'IN_PROGRESS'
  if (pending && task.overdue) return 'OVERDUE'
  return (task.assignmentState in HOME_TASK_STATES ? task.assignmentState : 'NOT_STARTED') as HomeTaskStateKey
}

export interface RelDue {
  text: string
  tone: '' | 'urgent' | 'late'
}

/** 相对截止：已过只说过了几天，未到给天/小时；3 天内为紧急档。以服务器时间为基准。 */
export function relDue(dueAt: string, nowIso: string): RelDue {
  const diff = Date.parse(dueAt) - Date.parse(nowIso)
  if (!Number.isFinite(diff)) return { text: '截止时间不可识别', tone: '' }
  const day = 86_400_000
  if (diff < 0) return { text: `已过 ${Math.max(1, Math.floor(-diff / day))} 天`, tone: 'late' }
  if (Number.isFinite(Date.parse(dueAt)) && beijingDateKey(dueAt) === beijingDateKey(nowIso)) return { text: '今天截止', tone: 'urgent' }
  const days = Math.floor(diff / day)
  const hours = Math.floor((diff % day) / 3_600_000)
  if (days < 1) return { text: `还剩 ${hours} 小时`, tone: 'urgent' }
  if (days < 3) return { text: `还剩 ${days} 天 ${hours} 小时`, tone: 'urgent' }
  return { text: `还剩 ${days} 天`, tone: '' }
}

const PARTS_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
})

function beijingParts(iso: string): Record<string, string> {
  return Object.fromEntries(PARTS_FORMAT.formatToParts(new Date(iso)).map(part => [part.type, part.value]))
}

export function beijingDateKey(iso: string): string {
  const p = beijingParts(iso)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** 10月28日 */
export function beijingMonthDay(iso: string): string {
  const p = beijingParts(iso)
  return `${p.month}月${p.day}日`
}

/** 周三 */
export function beijingWeekday(iso: string): string {
  return beijingParts(iso).weekday ?? ''
}

/** 09:30 */
export function beijingHM(iso: string): string {
  const p = beijingParts(iso)
  return `${p.hour}:${p.minute}`
}

/** 10月28日 09:30 */
export function beijingAt(iso: string): string {
  return `${beijingMonthDay(iso)} ${beijingHM(iso)}`
}

/** 按北京时间的小时给出问候语。 */
export function greetingOf(serverTime: string): string {
  const hour = Number(beijingParts(serverTime).hour)
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
