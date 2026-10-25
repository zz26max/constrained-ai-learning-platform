import type { LearningEventsWrite } from '../api/tutoring'
import { guard, invalid, ok } from './envelope'
import type { MockHandler, MockRequestContext, MockResult } from './types'

const EVENT_TYPES = ['chapter_opened', 'resource_opened', 'editor_opened', 'preview_opened'] as const
const EDITOR_FILES = ['index.html', 'style.css', 'script.js', 'answer.sql', 'answer.md'] as const
const VIEWPORTS = ['desktop', 'mobile'] as const

/** mock 事件去重表：按 eventId 幂等（契约描述），随模块生命周期重置。 */
const seenEventIds = new Set<string>()

export function resetMockAnalyticsState(): void {
  seenEventIds.clear()
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

function validateEvent(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return '事件必须是对象。'
  const event = raw as Record<string, unknown>
  if (!isUuid(event.eventId)) return 'eventId 必须是 UUID。'
  if (!isUuid(event.sessionId)) return 'sessionId 必须是 UUID。'
  if (!isTimestamp(event.occurredAt)) return 'occurredAt 必须是时间戳。'
  if (!isUuid(event.offeringId)) return 'offeringId 必须是 UUID。'
  if (event.assignmentId !== undefined && !isUuid(event.assignmentId)) return 'assignmentId 必须是 UUID。'
  if (event.chapterId !== undefined && !isUuid(event.chapterId)) return 'chapterId 必须是 UUID。'
  switch (event.type) {
    case 'chapter_opened':
      if (!isUuid(event.chapterId)) return 'chapter_opened 需要 chapterId。'
      if (JSON.stringify(event.payload ?? null) !== '{}') return 'chapter_opened 的 payload 必须为空对象。'
      return null
    case 'resource_opened': {
      const payload = event.payload as Record<string, unknown> | undefined
      if (payload === undefined || !isUuid(payload.resourceId)) return 'resource_opened 需要 payload.resourceId。'
      return null
    }
    case 'editor_opened': {
      const payload = event.payload as Record<string, unknown> | undefined
      if (!isUuid(event.assignmentId)) return 'editor_opened 需要 assignmentId。'
      if (payload === undefined || !EDITOR_FILES.includes(payload.activeFile as never)) return 'editor_opened 的 activeFile 不在白名单。'
      return null
    }
    case 'preview_opened': {
      const payload = event.payload as Record<string, unknown> | undefined
      if (!isUuid(event.assignmentId)) return 'preview_opened 需要 assignmentId。'
      if (payload === undefined || !VIEWPORTS.includes(payload.viewport as never)) return 'preview_opened 的 viewport 必须是 desktop 或 mobile。'
      return null
    }
    default:
      return 'type 必须是四种客户端事件之一。'
  }
}

const handleRecordLearningEvents: MockHandler = (context: MockRequestContext): MockResult => {
  const denied = guard(context, ['student', 'teacher'])
  if (denied !== null) return denied
  const body = context.bodyJson as Record<string, unknown> | null
  const events = body !== null && typeof body === 'object' && Array.isArray((body as LearningEventsWrite).events)
    ? (body as LearningEventsWrite).events
    : null
  if (events === null || events.length < 1 || events.length > 50) return invalid(context, 'events 必须是 1 到 50 条的事件数组。', 'events')
  for (const event of events) {
    const problem = validateEvent(event)
    if (problem !== null) return invalid(context, problem, 'events')
  }
  let acceptedCount = 0
  let duplicateCount = 0
  for (const event of events) {
    const eventId = (event as { eventId: string }).eventId
    if (seenEventIds.has(eventId)) duplicateCount += 1
    else {
      seenEventIds.add(eventId)
      acceptedCount += 1
    }
  }
  return ok(context, { acceptedCount, duplicateCount })
}

export const analyticsHandlers: Record<string, MockHandler> = {
  recordLearningEvents: handleRecordLearningEvents,
}

resetMockAnalyticsState()
