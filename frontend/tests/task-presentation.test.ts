import {describe,it,expect} from 'vitest'
import {taskAction,canEnterWorkspace,matchesTask,byDeadline,byRecentStudy,deadlineLabel} from '../src/features/assignments/task-presentation'
import type {AssignmentSummaryDTO,AssignmentDetailDTO} from '../src/api/assignments'
import type {CourseSummaryDTO} from '../src/api/courses'
const task=(over:Partial<AssignmentSummaryDTO>={})=>({id:'a',dueAt:'2026-10-20T00:00:00Z',assignmentState:'NOT_STARTED',offeringStatus:'active',publicationState:'published',...over} as AssignmentSummaryDTO)
describe('学生任务展示与服务端权限',()=>{
  it('未读取资格或不允许提交时只查看；不能从未开始状态推断权限',()=>{
    expect(taskAction(task())).toBe('查看详情')
    expect(taskAction(task(),{canSubmit:false} as AssignmentDetailDTO)).toBe('查看详情')
    expect(taskAction(task(),{canSubmit:true,overdue:false} as AssignmentDetailDTO)).toBe('开始作答')
    expect(taskAction(task({assignmentState:'IN_PROGRESS'}),{canSubmit:true,overdue:false} as AssignmentDetailDTO)).toBe('继续作答')
  })
  it('补交与归档按真实资格，已提交/已批改保持查看入口',()=>{
    const late={canSubmit:true,overdue:true} as AssignmentDetailDTO
    expect(taskAction(task(),late)).toBe('继续补交')
    expect(taskAction(task({publicationState:'archived'}),late)).toBe('查看详情')
    expect(taskAction(task({offeringStatus:'archived'}),late)).toBe('查看详情')
    expect(taskAction(task({assignmentState:'SUBMITTED'}),late)).toBe('查看提交')
    expect(taskAction(task({assignmentState:'REVIEWED'}),late)).toBe('查看评价')
  })
  it('只有确认可提交的未完成任务直达工作区，其余进说明页',()=>{
    const allowed={canSubmit:true,overdue:false} as AssignmentDetailDTO
    expect(canEnterWorkspace(task(),allowed)).toBe(true)
    expect(canEnterWorkspace(task({assignmentState:'IN_PROGRESS'}),allowed)).toBe(true)
    expect(canEnterWorkspace(task(),{canSubmit:true,overdue:true} as AssignmentDetailDTO)).toBe(true)
    expect(canEnterWorkspace(task())).toBe(false)
    expect(canEnterWorkspace(task(),{canSubmit:false} as AssignmentDetailDTO)).toBe(false)
    expect(canEnterWorkspace(task({assignmentState:'SUBMITTED'}),allowed)).toBe(false)
    expect(canEnterWorkspace(task({assignmentState:'REVIEWED'}),allowed)).toBe(false)
    expect(canEnterWorkspace(task({publicationState:'archived'}),allowed)).toBe(false)
    expect(canEnterWorkspace(task({offeringStatus:'archived'}),allowed)).toBe(false)
  })
  it('状态筛选区分待办/提交/评价；截止顺序稳定',()=>{
    expect(matchesTask(task(),'todo')).toBe(true)
    expect(matchesTask(task({publicationState:'archived'}),'todo')).toBe(false)
    expect(matchesTask(task({assignmentState:'SUBMITTED'}),'todo')).toBe(false)
    expect(matchesTask(task({assignmentState:'SUBMITTED'}),'submitted')).toBe(true)
    expect(matchesTask(task({assignmentState:'REVIEWED'}),'reviewed')).toBe(true)
    expect([task({id:'b'}),task({id:'c',dueAt:'2026-10-19T00:00:00Z'}),task()].sort(byDeadline).map(t=>t.id)).toEqual(['c','a','b'])
  })
  it('时间文案不代替处理状态，精确覆盖截止边界',()=>{
    const now=Date.parse('2026-10-19T00:00:00Z')
    expect(deadlineLabel('2026-10-19T00:00:00Z',now)).toBe('已截止')
    expect(deadlineLabel('2026-10-19T00:30:00Z',now)).toContain('不足 1 小时')
    expect(deadlineLabel('2026-10-19T02:00:00Z',now)).toContain('2 小时')
  })
  it('最近学习排序跨完整列表，未学习排后',()=>{
    const items=[{offeringId:'a',lastStudiedAt:null},{offeringId:'b',lastStudiedAt:'2026-10-19T00:00:00Z'},{offeringId:'c',lastStudiedAt:'2026-10-18T00:00:00Z'}] as CourseSummaryDTO[]
    expect(items.sort(byRecentStudy).map(c=>c.offeringId)).toEqual(['b','c','a'])
  })
})
