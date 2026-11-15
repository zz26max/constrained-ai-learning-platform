import { computed, watch } from 'vue'
import { assignmentsApi } from '../../api'
import type { AssignmentSummaryDTO, CheckDTO } from '../../api/assignments'
import type { CourseSummaryDTO } from '../../api/courses'
import { allPages } from '../../api/pagination'
import { usePageQuery } from '../courses/use-page-query'
import { runBounded } from '../courses/worker-pool'

export function isSelfStudyCourse(course: Pick<CourseSummaryDTO, 'status' | 'teachers'> | null | undefined): boolean {
  return course?.status === 'active' && course.teachers.length === 0
}

export function passedSelfCheck(check: CheckDTO | null): boolean {
  return check?.status === 'completed' && check.result !== null
    && check.result.total > 0 && check.result.total === check.result.passed
}

interface Practice {
  task: AssignmentSummaryDTO
  check: CheckDTO | null
  passed: boolean
}

export function useSelfStudyPractices(offeringId: () => string | undefined) {
  const api = assignmentsApi()
  const query = usePageQuery(async signal => {
    const id = offeringId()
    if (!id) return { offeringId: id, practices: [] }
    const assignments = await allPages((page, pageSize, signal) =>
      api.listMyAssignments({ offeringId: id, page, pageSize }, { signal }).then(response => response.data), signal)
    const labs = assignments.filter(task => task.publicationState === 'published' && task.type !== 'text')
    const results = await runBounded(labs.map(task => async (): Promise<Practice | null> => {
      const { data: workspace } = await api.getWorkspace(task.id, { signal })
      const { data: { configured, check } } = await api.getAssignmentCheck(task.id, workspace.revision, { signal })
      return configured ? { task, check, passed: passedSelfCheck(check) } : null
    }), 3, signal)
    return { offeringId: id, practices: results.filter(item => item !== null) }
  })
  watch(offeringId, () => { void query.load() }, { immediate: true })
  const practices = computed(() => query.status.value === 'success' && query.data.value?.offeringId === offeringId()
    ? query.data.value?.practices ?? [] : [])
  const passedCount = computed(() => practices.value.filter(item => item.passed).length)
  const checking = computed(() => practices.value.some(isChecking))
  return { ...query, practices, passedCount, checking }
}

function isChecking(item: Practice): boolean {
  return item.check?.status === 'queued' || item.check?.status === 'running'
}

/** Prefer the same chapter as the practice just passed, then keep the course's task order. */
export function nextSelfStudyPractice(practices: Practice[], justPassedId?: string): Practice | undefined {
  const completed = justPassedId
    ? practices.find(item => item.task.id === justPassedId)
    : practices.filter(item => item.passed).sort((a, b) =>
      (b.check?.completedAt ?? '').localeCompare(a.check?.completedAt ?? ''))[0]
  const incomplete = practices.filter(item => item.task.id !== justPassedId && !item.passed && !isChecking(item))
  const chapter = completed?.task.chapterId
  return (chapter ? incomplete.find(item => item.task.chapterId === chapter) : undefined) ?? incomplete[0]
}
