import { describe, expect, it } from 'vitest'
import type { AssignmentWriteDTO } from '../src/api/assignments'
import { assignmentBody, localDateTime, templateFiles } from '../src/features/assignments/assignment-form'

const form: AssignmentWriteDTO = { title: '作业', type: 'web_lab', isRequired: true, description: '', requirements: ['实现'], estimatedMinutes: 20, knowledgePointIds: [], dueAt: '2026-11-10T16:00:01', lateUntil: '', allowResubmit: false, maxAttempts: 1, maxScore: 100, rubric: [{ criterionId: 'c1', title: '完成', description: '', maxScore: 100 }], initialFiles: templateFiles('web_lab'), aiPolicyVersion: null }
describe('教师作业表单契约', () => {
  it('草稿请求不带只读 aiPolicyVersion，日期转换为 UTC，可空延期为空时发 null', () => {
    const body = assignmentBody(form, false)
    expect(body).not.toHaveProperty('aiPolicyVersion')
    expect(body.dueAt).toBe(new Date(form.dueAt).toISOString())
    expect(body.lateUntil).toBeNull()
    expect(form.aiPolicyVersion).toBeNull()
  })
  it('发布后仅发送允许变更的三项，避免只改描述却带上模板和量规', () => {
    expect(Object.keys(assignmentBody(form, true)).sort()).toEqual(['description', 'dueAt', 'lateUntil'])
  })
  it('已保存时间恢复为本地控件值，往返不改变时间', () => {
    const value = '2026-11-10T08:00:01Z'
    expect(new Date(localDateTime(value)).toISOString()).toBe(new Date(value).toISOString())
  })
  it('三类模板只包含契约规定的文件', () => {
    expect(templateFiles('web_lab').map(f => f.path)).toEqual(['index.html', 'style.css', 'script.js'])
    expect(templateFiles('sql_text').map(f => f.path)).toEqual(['answer.sql'])
    expect(templateFiles('text').map(f => f.path)).toEqual(['answer.md'])
  })
})
