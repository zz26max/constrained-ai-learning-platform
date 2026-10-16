import type { components } from '../../api/generated/schema'

type AssignmentState = components['schemas']['AssignmentState']

export function assignmentStateLabel(state: AssignmentState): string {
  switch (state) {
    case 'NOT_STARTED': return '未开始'
    case 'IN_PROGRESS': return '进行中'
    case 'SUBMITTED': return '已提交'
    case 'REVIEWED': return '已评价'
  }
}

export function formatDueTime(dueAt: string, overdue: boolean): string {
  const date = new Date(dueAt)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (overdue) return '已截止'
  if (days < 0) return '已截止'
  if (days === 0) return '今天截止'
  if (days === 1) return '明天截止'
  if (days <= 7) return `${days}天后截止`

  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
}

/** 截止文案：dueAt 为空显示"无截止时间"；逾期判断只信后端 overdue。 */
export function dueText(dueAt: string | null | undefined, overdue: boolean): string {
  if (dueAt === null || dueAt === undefined || dueAt === '') return '无截止时间'
  return formatDueTime(dueAt, overdue)
}

export function formatScore(score: number | null, maxScore: number): string {
  if (score === null) return '未评分'
  return `${score}/${maxScore}`
}

export function isUuid(value: string | string[] | undefined): value is string {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
