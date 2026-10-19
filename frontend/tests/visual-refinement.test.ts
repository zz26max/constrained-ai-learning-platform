import {describe,it,expect} from 'vitest'
import {mount} from '@vue/test-utils'
import {chapterEntry,deadlineGroups,submissionLabel} from '../src/demo/campus/visual/refinement'
import CountProgress from '../src/demo/campus/visual/CountProgress.vue'

describe('V3.4.1 presentation preserves actual state and record identity',()=>{
 it('never grants submission from a deadline or progress state alone',()=>{
  expect(submissionLabel(undefined)).toBe('提交资格未确认')
  expect(submissionLabel({canSubmit:false,overdue:false,assignmentState:'IN_PROGRESS'})).toBe('暂不可提交')
  expect(submissionLabel({canSubmit:true,overdue:true,assignmentState:'IN_PROGRESS'})).toBe('允许补交')
  expect(submissionLabel({canSubmit:true,overdue:false,assignmentState:'SUBMITTED'})).toBe('可再次提交')
 })
 it.each([['completed','复习章节'],['in_progress','继续阅读'],['not_started','开始阅读']] as const)('labels a published %s chapter correctly',(status,label)=>{
  expect(chapterEntry({publicationState:'published',studentProgress:{status,completedAt:null}})).toMatchObject({allowed:true,label})
 })
 it('does not treat missing progress as unread or inaccessible',()=>{
  expect(chapterEntry({publicationState:'published',studentProgress:null})).toMatchObject({allowed:true,label:'查看章节'})
 })
 it('does not offer an entry for an unpublished chapter',()=>{
  expect(chapterEntry({publicationState:'draft',studentProgress:null})).toMatchObject({allowed:false,label:'尚未开放'})
 })
 it('groups equal instants without merging assignments or mutating source order',()=>{
  const items=[{id:'c',dueAt:'2026-10-24T10:15:00Z'},{id:'b',dueAt:'2026-10-24T18:00:00+08:00'},{id:'a',dueAt:'2026-10-24T10:00:00Z'}]
  const original=structuredClone(items),groups=deadlineGroups(items)
  expect(groups.map(g=>g.items.map(i=>i.id))).toEqual([['a','b'],['c']])
  expect(items).toEqual(original);expect(groups[0]?.items[0]).toBe(items[2])
 })
 it('keeps empty and single-item schedules natural',()=>{
  expect(deadlineGroups([])).toEqual([])
  expect(deadlineGroups([{id:'one',dueAt:'2026-11-02T10:00:00Z'}])).toHaveLength(1)
 })
 it('uses a continuous ratio for many chapters while preserving the real total',()=>{
  const wrapper=mount(CountProgress,{props:{completed:18,total:36,title:'边界课程',refined:true,showPercent:true,percent:50}})
  expect(wrapper.text()).toContain('36 已阅读');expect(wrapper.text()).toContain('50%')
  expect(wrapper.get('[role=progressbar]').attributes('aria-valuenow')).toBe('50')
  expect(wrapper.findAll('.vx-segments i')).toHaveLength(1)
  wrapper.unmount()
 })
 it('does not fabricate a percentage or bar when there are no open chapters',()=>{
  const wrapper=mount(CountProgress,{props:{completed:0,total:0,title:'未开放课程',refined:true,showPercent:true}})
  expect(wrapper.text()).toContain('尚未开放');expect(wrapper.text()).not.toContain('%');expect(wrapper.find('[role=progressbar]').exists()).toBe(false)
  wrapper.unmount()
 })
})
