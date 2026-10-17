import type { AssignmentPatch, AssignmentWriteDTO } from '../../api/assignments'

export function localDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const two = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

export function assignmentBody(form: AssignmentWriteDTO, published: boolean): AssignmentPatch {
  const dueAt = new Date(form.dueAt).toISOString()
  const lateUntil = form.lateUntil ? new Date(form.lateUntil).toISOString() : null
  if (published) return { description: form.description, dueAt, lateUntil }
  const { aiPolicyVersion: _unused, ...body } = form
  return { ...body, dueAt, lateUntil }
}

export function templateFiles(type: AssignmentWriteDTO['type']): AssignmentWriteDTO['initialFiles'] {
  if (type === 'sql_text') return [{ path: 'answer.sql', content: '-- 在此编写 SQL\n' }]
  if (type === 'text') return [{ path: 'answer.md', content: '# 作答\n' }]
  return [{ path: 'index.html', content: '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><main></main><script src="script.js"></script></body></html>' }, { path: 'style.css', content: '' }, { path: 'script.js', content: '' }]
}
