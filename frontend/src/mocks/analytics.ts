import type { LearningEventsWrite } from '../api/tutoring'
import { fail, guard, invalid, ok } from './envelope'
import type { MockHandler, MockRequestContext, MockResult } from './types'

const EVENT_TYPES = ['chapter_opened', 'resource_opened', 'editor_opened', 'preview_opened'] as const
const EDITOR_FILES = ['index.html', 'style.css', 'script.js', 'answer.sql', 'answer.md'] as const
const VIEWPORTS = ['desktop', 'mobile'] as const

/** mock 事件去重表：eventId → canonical 正文（键排序 JSON，与后端 canonical 语义一致）。 */
const seenEventIds = new Map<string, string>()

export function resetMockAnalyticsState(): void {
  seenEventIds.clear()
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

/** 键排序的 canonical JSON：同一事件的不同键序正文视为相同。 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

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
  // 契约：同 eventId 同正文计 duplicate；同 eventId 不同正文 409 EVENT_CONFLICT。
  // 先整批比对（含批内重复），全部通过才提交，冲突时整批回滚不留部分写入。
  const canonicals = events.map(event => canonicalJson(event))
  const batch = new Map<string, string>()
  let acceptedCount = 0
  let duplicateCount = 0
  for (let index = 0; index < events.length; index += 1) {
    const eventId = (events[index] as { eventId: string }).eventId
    const canonical = canonicals[index]!
    const existing = seenEventIds.get(eventId) ?? batch.get(eventId)
    if (existing !== undefined) {
      if (existing !== canonical) return fail(context, 409, 'EVENT_CONFLICT', '同一事件 ID 对应不同正文。')
      duplicateCount += 1
    } else {
      batch.set(eventId, canonical)
      acceptedCount += 1
    }
  }
  for (const [eventId, canonical] of batch) seenEventIds.set(eventId, canonical)
  return ok(context, { acceptedCount, duplicateCount })
}

export const analyticsHandlers: Record<string, MockHandler> = {
  recordLearningEvents: handleRecordLearningEvents,
}

resetMockAnalyticsState()
