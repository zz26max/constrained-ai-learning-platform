import {describe,it,expect} from 'vitest'
import {createCampusState} from '../src/demo/campus/data'
import {taskDayGroups,taskContentTone} from '../src/features/student/visual/content-presentation'
import {mount} from '@vue/test-utils'
import CraftDate from '../src/features/student/visual/CraftDate.vue'
const sample=createCampusState().assignments[0]!
const epoch=Date.parse('2026-10-19T02:00:00Z')
describe('content presentation preserves real task meaning',()=>{
 it('groups different deadlines within the same Beijing day without losing order or identity',()=>{
  const tasks=[{...sample,id:'b',dueAt:'2026-10-19T10:00:00Z'},{...sample,id:'a',dueAt:'2026-10-18T23:00:00Z'},{...sample,id:'c',dueAt:'2026-10-19T17:00:00Z'}]
  const groups=taskDayGroups(tasks,epoch)
  expect(groups.map(g=>[g.key,g.tasks.map(t=>t.id)])).toEqual([['2026-10-19',['a','b']],['2026-10-20',['c']]])
  expect(tasks.map(t=>t.id)).toEqual(['b','a','c']);expect(groups[0]!.context).toBe('今天截止');expect(groups[1]!.context).toBe('明天截止')
  expect(groups[0]!.tasks[1]!.dueAt).toBe('2026-10-19T10:00:00Z')
 })
 it('retains equal instants as independent tasks and handles an empty day flow',()=>{
  const tasks=[{...sample,id:'a',dueAt:'2026-10-19T10:00:00Z'},{...sample,id:'b',dueAt:'2026-10-19T18:00:00+08:00'}]
  expect(taskDayGroups(tasks,epoch)[0]!.tasks).toHaveLength(2);expect(taskDayGroups([],epoch)).toEqual([])
 })
 it('only emphasizes an upcoming task when actual submission is allowed',()=>{
  const task={...sample,overdue:false,publicationState:'published' as const,offeringStatus:'active' as const,assignmentState:'IN_PROGRESS' as const,dueAt:'2026-10-19T10:00:00Z'}
  expect(taskContentTone(task,undefined,epoch)).toBe('active');expect(taskContentTone(task,{canSubmit:false},epoch)).toBe('active');expect(taskContentTone(task,{canSubmit:true},epoch)).toBe('soon')
 })
 it('keeps archive, reviewed and submitted meanings independent of temporal color',()=>{
  const task={...sample,overdue:true,publicationState:'published' as const,offeringStatus:'active' as const,assignmentState:'IN_PROGRESS' as const}
  expect(taskContentTone(task,{canSubmit:true},epoch)).toBe('overdue')
  expect(taskContentTone({...task,assignmentState:'REVIEWED'},undefined,epoch)).toBe('reviewed')
  expect(taskContentTone({...task,assignmentState:'SUBMITTED'},undefined,epoch)).toBe('submitted')
  expect(taskContentTone({...task,publicationState:'archived'},undefined,epoch)).toBe('archived')
 })
 it('day anchors omit a misleading shared clock while individual deadlines keep accessible time',()=>{
  const w=mount(CraftDate,{props:{value:'2026-10-19T10:00:00Z',dayOnly:true}})
  expect(w.find('.vc-date-time').exists()).toBe(false);expect(w.get('time').attributes('aria-label')).toBe('2026年10月19日 北京时间');w.unmount()
  const full=mount(CraftDate,{props:{value:'2026-10-19T10:00:00Z'}});expect(full.get('.vc-date-time').text()).toBe('18:00');full.unmount()
 })
})
