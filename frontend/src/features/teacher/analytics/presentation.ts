import type { components } from '../../../api/generated/schema'

type ActivityDayDTO = components['schemas']['ActivityDayDTO']
type KnowledgeStateDistributionDTO = components['schemas']['KnowledgeStateDistributionDTO']

export const ACTIVITY_FIELDS = [
  ['chapterOpenedCount', '章节打开'],
  ['resourceOpenedCount', '资料打开'],
  ['editorOpenedCount', '编辑工作区'],
  ['previewOpenedCount', '预览页面'],
  ['workspaceSavedCount', '保存工作区'],
  ['assignmentSubmittedCount', '提交作业'],
  ['helpRequestCreatedCount', '发起求助'],
  ['tutoringCompletedCount', '完成 AI 辅导'],
] as const satisfies ReadonlyArray<readonly [Exclude<keyof ActivityDayDTO, 'date' | 'activeStudentCount'>, string]>

type ActivityCounts = Pick<ActivityDayDTO, (typeof ACTIVITY_FIELDS)[number][0]>

export function activityEventTotal(counts: ActivityCounts): number {
  return ACTIVITY_FIELDS.reduce((sum, [field]) => sum + counts[field], 0)
}

export type MasteryState = 'basically_mastered' | 'needs_practice' | 'learning' | 'insufficient_evidence'

/** 展示顺序：掌握程度由深到浅，颜色取同一墨色阶。 */
export const MASTERY_ORDER: readonly MasteryState[] = [
  'basically_mastered', 'learning', 'needs_practice', 'insufficient_evidence',
]

export const MASTERY_LABELS: Record<MasteryState, string> = {
  basically_mastered: '基本掌握',
  learning: '学习中',
  needs_practice: '需要练习',
  insufficient_evidence: '证据不足',
}

export const DISTRIBUTION_FIELDS: Record<MasteryState, keyof KnowledgeStateDistributionDTO> = {
  basically_mastered: 'basicallyMastered',
  learning: 'learning',
  needs_practice: 'needsPractice',
  insufficient_evidence: 'insufficientEvidence',
}

const MASTERY_TOKENS: Record<MasteryState, string> = {
  basically_mastered: '--mastery-4',
  learning: '--mastery-3',
  needs_practice: '--mastery-2',
  insufficient_evidence: '--mastery-1',
}

export interface AnalyticsColors {
  ink: string
  muted: string
  line: string
  blue: string
  mastery: Record<MasteryState, string>
}

function token(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 图表颜色只从设计令牌读取，不在图表配置里另写色值。 */
export function analyticsColors(): AnalyticsColors {
  return {
    ink: token('--ink'),
    muted: token('--muted'),
    line: token('--line'),
    blue: token('--blue'),
    mastery: {
      basically_mastered: token(MASTERY_TOKENS.basically_mastered),
      learning: token(MASTERY_TOKENS.learning),
      needs_practice: token(MASTERY_TOKENS.needs_practice),
      insufficient_evidence: token(MASTERY_TOKENS.insufficient_evidence),
    },
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function formatPercent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    switch (character) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}
