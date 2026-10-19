import type { AssignmentDetailDTO } from '../../api/assignments'
import type { ChapterSummaryDTO } from '../../api/courses'
import { byDeadline } from '../assignments/task-presentation'

/** Group exact instants, including equivalent offset representations; never mutate source order. */
export function groupByDeadline(tasks: AssignmentDetailDTO[]) {
  const groups = new Map<number, { key: number; dueAt: string; tasks: AssignmentDetailDTO[] }>()
  for (const task of [...tasks].sort(byDeadline)) {
    const key = Date.parse(task.dueAt)
    const group = groups.get(key) ?? { key, dueAt: task.dueAt, tasks: [] }
    group.tasks.push(task)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function compactDeadline(value: string, now = new Date(), includeSeconds = true): string {
  const date = new Date(value)
  const year = (d: Date) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(d)
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    ...(year(date) !== year(now) ? { year: 'numeric' as const } : {}),
    ...(includeSeconds && (date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) ? { second: '2-digit' as const } : {}),
  }).format(date)
}

/** Missing chapter progress is unknown, not an invented unread chapter. */
export function chapterOverview(items: ChapterSummaryDTO[]) {
  const chapters = items.filter(c => c.publicationState === 'published').sort((a,b) => a.number-b.number || a.id.localeCompare(b.id))
  const completed = chapters.filter(c => c.studentProgress?.status === 'completed').length
  const unknown = chapters.some(c => c.studentProgress === null)
  const next = chapters.find(c => c.studentProgress?.status === 'not_started' || c.studentProgress?.status === 'in_progress')
  return { chapters, completed, total: chapters.length, unknown, next,
    percent: chapters.length ? Math.round(completed / chapters.length * 100) : 0,
    allRead: chapters.length > 0 && completed === chapters.length }
}
