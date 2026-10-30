export function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '日期不可识别' : new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short',
  }).format(date)
}

export function formatShortTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间不可识别' : new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

export function localBeijingToUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error('请输入有效的北京时间。')
  const date = new Date(value + (value.length === 16 ? ':00' : '') + '+08:00')
  if (Number.isNaN(date.getTime())) throw new Error('请输入有效的北京时间。')
  return date.toISOString()
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = { active: '进行中', archived: '已归档', draft: '草稿', published: '已发布', not_started: '未开始', in_progress: '阅读中', completed: '已阅读' }
  return labels[status] ?? '不兼容的状态：' + status
}

export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
