import { allPages } from '../../api/pagination'
import type { AssignmentsApi } from '../../api/assignments'

export async function reviewQueue(api: AssignmentsApi, assignmentId: string, status: '' | 'none' | 'draft' | 'published', latestOnly: boolean, startId: string, signal: AbortSignal): Promise<string[]> {
  if (status === 'published') return []
  const rows = await allPages(async (page,pageSize,signal) => (await api.listTeacherSubmissions(assignmentId, {page,pageSize,latestOnly,...(status ? {feedbackStatus:status} : {})}, {signal})).data,signal)
  const ids=rows.filter(s=>s.feedbackStatus !== 'published' && !s.superseded).map(s=>s.id)
  const at=ids.indexOf(startId)
  return at < 0 ? [] : [...ids.slice(at),...ids.slice(0,at)]
}
