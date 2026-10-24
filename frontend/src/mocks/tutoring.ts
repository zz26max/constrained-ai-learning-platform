import type { components } from '../api/generated/schema'
import type { AiPolicyDTO, TutoringMessageDTO, TutoringRequestDTO, TutoringResult } from '../api/tutoring'
import { mockSession } from './auth'
import { MOCK_STUDENT, fail, guard, invalid, missing, ok, paginate, pageWindow, searchParams, segment } from './envelope'
import { P1B_IDS } from './assignments'
import { randomUUID } from './random'
import type { MockHandler, MockRequestContext, MockResult } from './types'

type TutoringWrite = components['schemas']['TutoringWrite']

const uuid = (value: number) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
export const P2_IDS = {
  seededSession: uuid(901),
  seededRequest: uuid(902),
} as const

const fixtureTime = '2026-10-14T02:00:00Z'
const now = () => new Date().toISOString()

/** mock 政策：仅已发布的演示作业启用引导模式；数值与 DEVELOPMENT §7 默认建议一致。 */
const POLICY: AiPolicyDTO = {
  assignmentId: P1B_IDS.assignmentWeb, version: 1, enabled: true,
  allowedActions: ['ask', 'concept', 'next_hint'], allowedModes: ['concept', 'debug_hint', 'guided_question'],
  restrictCompleteSolution: true, allowCodeBlocks: false, maxHintLevel: 3, requireAttemptFromLevel: 2,
  dailyUserLimit: 30, dailyAssignmentLimit: 12, perMinuteLimit: 3, maxOutputTokens: 800,
  boundaryText: '引导模式：AI 只解释概念、指出排查方向并提出引导问题，不提供完整可提交实现。',
}

const ISSUE_TAGS = {
  version: 1,
  items: [
    { tag: 'layout_overflow', title: '布局溢出', description: '容器在窄屏或内容变化时溢出' },
    { tag: 'flex_alignment', title: '弹性对齐', description: 'Flex 项目未按预期对齐或分布' },
    { tag: 'box_model', title: '盒模型', description: '内边距、边框或宽度计算不符合预期' },
  ],
} as const

/** 索答请求的固定回退模板：fallback 交付安全内容，不伪装成模型个性化回复。 */
const FALLBACK_CONTENT = '我不能直接提供完整实现。建议先描述当前现象，再从边界与盒模型逐项检查；也可以把已有尝试整理后向教师求助。'

interface StoredSession {
  id: string
  assignmentId: string
  studentId: string
  createdAt: string
  status: 'active' | 'closed'
  pendingRequestId: string | null
  lastMessageAt: string | null
  messages: TutoringMessageDTO[]
  nextSequence: number
}

interface StoredRequest {
  dto: TutoringRequestDTO
  studentId: string
  sessionId: string
  action: TutoringWrite['action']
  content: string
  polls: number
}

const sessions = new Map<string, StoredSession>()
const requests = new Map<string, StoredRequest>()
/** 跨会话共享：同学生同作业已交付的最高提示层次（DEVELOPMENT §7.1）。 */
const highestLevel = new Map<string, number>()

function sessionSummary({ id, assignmentId, createdAt, status, pendingRequestId, lastMessageAt }: StoredSession) {
  return { id, assignmentId, createdAt, status, pendingRequestId, lastMessageAt }
}

export function resetMockTutoringState(): void {
  sessions.clear()
  requests.clear()
  highestLevel.clear()
  highestLevel.set(`${MOCK_STUDENT.id}:${P1B_IDS.assignmentWeb}`, 1)
  const seeded: StoredSession = {
    id: P2_IDS.seededSession, assignmentId: P1B_IDS.assignmentWeb, studentId: MOCK_STUDENT.id,
    createdAt: fixtureTime, status: 'active', pendingRequestId: null, lastMessageAt: fixtureTime,
    nextSequence: 3,
    messages: [
      { id: randomUUID(), sequence: 1, role: 'student', content: '窄屏时菜单溢出，应该检查哪里？', createdAt: fixtureTime, tutoringRequestId: P2_IDS.seededRequest, mode: null, hintLevel: null, policyVersion: null, contentUnavailableReason: null },
      { id: randomUUID(), sequence: 2, role: 'assistant', content: '先观察溢出发生的具体断点；再检查容器的宽度约束与子项的 min-width。你注意到溢出从哪个宽度开始了吗？', createdAt: fixtureTime, tutoringRequestId: P2_IDS.seededRequest, mode: 'guided_question', hintLevel: 1, policyVersion: 1, contentUnavailableReason: null },
    ],
  }
  sessions.set(seeded.id, seeded)
}

function wantsCompleteSolution(content: string): boolean {
  return /完整(代码|实现|答案)|直接(给|告诉我|写)(答案|代码|实现)/.test(content)
}

/** 终态结果按意图决定：索答走 fallback，concept 固定第 1 层，ask 维持最高层，next_hint 升一层。 */
function buildResult(action: TutoringWrite['action'], content: string, highest: number): TutoringResult {
  if (wantsCompleteSolution(content)) {
    return { mode: 'fallback', hintLevel: highest, policyVersion: 1, generationPolicyVersion: 1, content: FALLBACK_CONTENT, nextAction: 'try_and_report', contentUnavailableReason: null }
  }
  if (action === 'concept') {
    return { mode: 'concept', hintLevel: 1, policyVersion: 1, generationPolicyVersion: 1, content: '弹性盒布局中，容器按主轴与交叉轴组织子项；子项的基础尺寸由 flex-basis 决定，收缩与放大分别由 flex-shrink 与 flex-grow 控制。', nextAction: 'review_concept', contentUnavailableReason: null }
  }
  if (action === 'next_hint') {
    const level = Math.min(highest + 1, POLICY.maxHintLevel)
    const hints = [
      '', '观察问题：确认溢出出现的视口宽度，并检查容器此时计算后的宽度。',
      '相关概念：检查子项是否设置了固定 min-width，或被 flex-shrink: 0 排除了收缩。',
      '验证修改：给可疑子项临时加边框，缩窄视口验证收缩是否生效。',
    ]
    return { mode: 'debug_hint', hintLevel: level, policyVersion: 1, generationPolicyVersion: 1, content: hints[level] ?? hints[1]!, nextAction: 'try_and_report', contentUnavailableReason: null }
  }
  return { mode: 'guided_question', hintLevel: Math.max(highest, 1), policyVersion: 1, generationPolicyVersion: 1, content: '你已经在缩小间距上做了一次尝试。如果仍然超出，问题更可能出在某个子项不可收缩；你觉得哪个子项最可疑，为什么？', nextAction: 'try_and_report', contentUnavailableReason: null }
}

/** 请求状态机：第 1 次轮询 queued→running，第 2 次轮询出终态并落助手消息；终态不再变化。 */
function advanceRequest(request: StoredRequest): void {
  if (request.dto.status === 'completed' || request.dto.status === 'fallback' || request.dto.status === 'failed') return
  request.polls += 1
  if (request.polls === 1) {
    request.dto.status = 'running'
    return
  }
  const session = sessions.get(request.sessionId)
  const key = `${request.studentId}:${session?.assignmentId ?? ''}`
  const highest = highestLevel.get(key) ?? 0
  const result = buildResult(request.action, request.content, highest)
  request.dto.result = result
  request.dto.status = result.mode === 'fallback' ? 'fallback' : 'completed'
  request.dto.completedAt = now()
  if (session !== undefined) {
    const assistant: TutoringMessageDTO = {
      id: randomUUID(), sequence: session.nextSequence++, role: 'assistant', content: result.content,
      createdAt: request.dto.completedAt, tutoringRequestId: request.dto.id,
      mode: result.mode, hintLevel: result.mode === 'fallback' ? null : result.hintLevel,
      policyVersion: result.policyVersion, contentUnavailableReason: result.contentUnavailableReason,
    }
    session.messages.push(assistant)
    session.lastMessageAt = assistant.createdAt
    if (session.pendingRequestId === request.dto.id) session.pendingRequestId = null
    if (result.mode !== 'fallback' && result.hintLevel > highest) highestLevel.set(key, result.hintLevel)
  }
}

function bodyJson(context: MockRequestContext): Record<string, unknown> {
  return context.bodyJson !== null && typeof context.bodyJson === 'object' ? context.bodyJson as Record<string, unknown> : {}
}

/** 学生角色处理器公共前置：会话校验通过后返回账号 ID，否则返回错误结果（MockResult 无 id 字段，用 'id' in 判别）。 */
function studentAccount(context: MockRequestContext, roles: readonly ('student' | 'teacher')[]): MockResult | { id: string } {
  const denied = guard(context, roles)
  if (denied !== null) return denied
  const session = mockSession()
  if (session === null) return fail(context, 401, 'UNAUTHENTICATED', '会话不存在或已过期。')
  return { id: session.account.id }
}

const handleGetAiPolicy: MockHandler = context => {
  const denied = guard(context, ['student', 'teacher'])
  if (denied !== null) return denied
  if (segment(context, 3) !== P1B_IDS.assignmentWeb) return missing(context)
  return ok(context, POLICY)
}

const handleGetIssueTags: MockHandler = context => {
  const denied = guard(context, ['student', 'teacher'])
  if (denied !== null) return denied
  return ok(context, structuredClone(ISSUE_TAGS))
}

const handleListSessions: MockHandler = context => {
  const account = studentAccount(context, ['student'])
  if (!('id' in account)) return account
  const window = pageWindow(searchParams(context))
  if (window === null) return invalid(context, '分页参数不合法。', 'page')
  const mine = [...sessions.values()]
    .filter(item => item.assignmentId === segment(context, 3) && item.studentId === account.id)
    .map(sessionSummary)
  return ok(context, paginate(mine, window))
}

const handleCreateSession: MockHandler = context => {
  const account = studentAccount(context, ['student'])
  if (!('id' in account)) return account
  const body = bodyJson(context)
  if (body.assignmentId !== P1B_IDS.assignmentWeb) return missing(context)
  const session: StoredSession = {
    id: randomUUID(), assignmentId: P1B_IDS.assignmentWeb, studentId: account.id,
    createdAt: now(), status: 'active', pendingRequestId: null, lastMessageAt: null, messages: [], nextSequence: 1,
  }
  sessions.set(session.id, session)
  return ok(context, { id: session.id, assignmentId: session.assignmentId, createdAt: session.createdAt, policyVersion: POLICY.version }, 201)
}

const handleListMessages: MockHandler = context => {
  const account = studentAccount(context, ['student'])
  if (!('id' in account)) return account
  const session = sessions.get(segment(context, 4))
  if (session === undefined || session.studentId !== account.id) return missing(context)
  const window = pageWindow(searchParams(context))
  if (window === null) return invalid(context, '分页参数不合法。', 'page')
  return ok(context, paginate(session.messages, window))
}

const handleSendMessage: MockHandler = context => {
  const account = studentAccount(context, ['student'])
  if (!('id' in account)) return account
  const session = sessions.get(segment(context, 4))
  if (session === undefined || session.studentId !== account.id) return missing(context)
  if (session.status === 'closed') return fail(context, 409, 'SESSION_CLOSED', '辅导会话已关闭，不接受新消息。')
  const body = bodyJson(context)
  const action = body.action
  const content = body.content
  if (action !== 'ask' && action !== 'concept' && action !== 'next_hint') return invalid(context, 'action 只能是 ask、concept 或 next_hint。', 'action')
  if (typeof content !== 'string' || (action === 'ask' && content.trim() === '')) return invalid(context, '提问内容不能为空。', 'content')
  const key = `${account.id}:${session.assignmentId}`
  const highest = highestLevel.get(key) ?? 0
  const targetLevel = action === 'next_hint' ? highest + 1 : highest
  if (action === 'next_hint' && targetLevel > POLICY.maxHintLevel) {
    return { status: 409, bodyJson: { error: { code: 'HINT_LIMIT_REACHED', message: '下一提示层次超过政策上限。', details: {} }, requestId: randomUUID() } }
  }
  const attemptMissing = body.studentAttempt === undefined || body.studentAttempt === null || body.studentAttempt === ''
  if (attemptMissing && targetLevel >= POLICY.requireAttemptFromLevel) {
    return invalid(context, '从第 2 层提示开始需要先描述你的实际尝试。', 'studentAttempt')
  }
  for (const request of requests.values()) {
    if (request.studentId === account.id && sessions.get(request.sessionId)?.assignmentId === session.assignmentId && (request.dto.status === 'queued' || request.dto.status === 'running')) {
      return { status: 409, bodyJson: { error: { code: 'AI_REQUEST_IN_PROGRESS', message: '同一作业已有进行中的请求。', details: { pendingRequestId: request.dto.id } }, requestId: randomUUID() } }
    }
  }
  const requestId = randomUUID()
  const message: TutoringMessageDTO = {
    id: randomUUID(), sequence: session.nextSequence++, role: 'student', content,
    createdAt: now(), tutoringRequestId: requestId, mode: null, hintLevel: null, policyVersion: null, contentUnavailableReason: null,
  }
  session.messages.push(message)
  session.lastMessageAt = message.createdAt
  const dto: TutoringRequestDTO = { id: requestId, sessionId: session.id, status: 'queued', result: null, error: null, createdAt: message.createdAt, completedAt: null }
  requests.set(requestId, { dto, studentId: account.id, sessionId: session.id, action, content, polls: 0 })
  session.pendingRequestId = requestId
  return ok(context, { tutoringRequestId: requestId, status: 'queued' }, 202)
}

const handleGetRequest: MockHandler = context => {
  const account = studentAccount(context, ['student'])
  if (!('id' in account)) return account
  const request = requests.get(segment(context, 4))
  if (request === undefined || request.studentId !== account.id) return missing(context)
  advanceRequest(request)
  return ok(context, request.dto)
}

export const tutoringHandlers: Record<string, MockHandler> = {
  getAiPolicy: handleGetAiPolicy,
  getIssueTags: handleGetIssueTags,
  listTutoringSessions: handleListSessions,
  createTutoringSession: handleCreateSession,
  listTutoringMessages: handleListMessages,
  sendTutoringMessage: handleSendMessage,
  getTutoringRequest: handleGetRequest,
}

resetMockTutoringState()
