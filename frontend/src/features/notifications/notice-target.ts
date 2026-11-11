import { assignmentsApi, coursesApi } from '../../api'
import type { TargetDTO } from '../../api/notices'

/** Keep the announcement visible when its linked teaching content is no longer readable. */
export async function requireReadableNoticeTarget(target: TargetDTO): Promise<void> {
  switch (target.type) {
    case 'chapter':
      await coursesApi().getChapter(target.id)
      break
    case 'resource':
      await coursesApi().getResource(target.id)
      break
    case 'assignment':
      await assignmentsApi().getAssignment(target.id)
      break
  }
}
