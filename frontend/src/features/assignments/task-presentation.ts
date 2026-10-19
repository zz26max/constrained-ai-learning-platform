import type { AssignmentDetailDTO, AssignmentSummaryDTO } from '../../api/assignments'
import type { CourseSummaryDTO } from '../../api/courses'

export type TaskFilter = 'todo' | 'submitted' | 'reviewed' | 'all'
export function matchesTask(task: AssignmentSummaryDTO, filter: TaskFilter): boolean {
  return filter === 'all' || (filter === 'todo' ? task.publicationState!=='archived' && task.offeringStatus!=='archived' && ['NOT_STARTED', 'IN_PROGRESS'].includes(task.assignmentState)
    : task.assignmentState === (filter === 'submitted' ? 'SUBMITTED' : 'REVIEWED'))
}
export function byDeadline(a: AssignmentSummaryDTO, b: AssignmentSummaryDTO): number {
  return Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id)
}
export function byRecentStudy(a: CourseSummaryDTO, b: CourseSummaryDTO): number {
  return (b.lastStudiedAt ? Date.parse(b.lastStudiedAt) : 0) - (a.lastStudiedAt ? Date.parse(a.lastStudiedAt) : 0) || a.offeringId.localeCompare(b.offeringId)
}
export function taskAction(task: AssignmentSummaryDTO, detail?: AssignmentDetailDTO): string {
  if (task.assignmentState === 'REVIEWED') return '查看评价'
  if (task.assignmentState === 'SUBMITTED') return '查看提交'
  if (task.publicationState === 'archived' || task.offeringStatus === 'archived' || detail?.canSubmit !== true) return '查看详情'
  if (detail.overdue) return '继续补交'
  return task.assignmentState === 'IN_PROGRESS' ? '继续作答' : '开始作答'
}
export function deadlineLabel(dueAt: string, now = Date.now()): string {
  const diff = Date.parse(dueAt) - now
  if (!Number.isFinite(diff)) return '截止时间不可识别'
  if (diff <= 0) return '已截止'
  if (diff < 3600000) return '◷ 不足 1 小时截止'
  if (diff <= 86400000) return `◷ ${Math.ceil(diff / 3600000)} 小时后截止`
  return `${Math.ceil(diff / 86400000)} 天后截止`
}
