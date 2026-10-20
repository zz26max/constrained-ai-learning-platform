import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount} from '@vue/test-utils'
import CraftDate from '../src/demo/campus/visual/CraftDate.vue'
import CraftTaskState from '../src/demo/campus/visual/CraftTaskState.vue'
import {craftDirection} from '../src/demo/campus/visual/craft-mode'
import {createCampusState} from '../src/demo/campus/data'
afterEach(()=>vi.useRealTimers())
describe('Visual Craft keeps temporal and permission semantics',()=>{
 it('renders the Beijing calendar day across the UTC boundary with full accessible time',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T02:00:00Z'))
  const w=mount(CraftDate,{props:{value:'2026-10-19T18:30:00Z'}})
  expect(w.get('.vc-date-day').text()).toBe('20');expect(w.get('.vc-date-time').text()).toBe('02:30')
  expect(w.get('time').attributes('aria-label')).toBe('2026年10月20日 02:30 北京时间');expect(w.find('.vc-date-year').exists()).toBe(false);w.unmount()
 })
 it('retains the year when the deadline belongs to a different year',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T02:00:00Z'))
  const w=mount(CraftDate,{props:{value:'2027-01-01T10:00:00Z'}});expect(w.get('.vc-date-year').text()).toContain('2027');expect(w.get('.vc-date-day').text()).toBe('01');w.unmount()
 })
 it('uses an explicitly requested local direction while keeping independent final defaults',()=>{
  expect(craftDirection('a','assignments')).toBe('a');expect(craftDirection('b','home')).toBe('b')
  expect(craftDirection(undefined,'home')).toBe('a');expect(craftDirection(undefined,'assignments')).toBe('b');expect(craftDirection(['b'],'messages')).toBe('a')
 })
 it('never infers eligibility from the visual urgency or a progress state',()=>{
  const task=createCampusState().assignments.find(a=>a.overdue&&a.canSubmit)!
  const w=mount(CraftTaskState,{props:{task}});expect(w.text()).toContain('提交资格未确认');expect(w.text()).not.toContain('允许补交');w.unmount()
 })
 it('separates real late eligibility, blocked submission and archived read-only states',()=>{
  const tasks=createCampusState().assignments
  for(const [task,label]of [[tasks.find(a=>a.overdue&&a.canSubmit)!,'允许补交'],[tasks.find(a=>a.overdue&&!a.canSubmit)!,'暂不可提交'],[{...tasks[0]!,publicationState:'archived' as const},'已归档 · 只读']] as const){
   const w=mount(CraftTaskState,{props:{task,detail:task,showDeadline:false}});expect(w.get('[aria-label="提交资格"]').text()).toBe(label);expect(w.find('.vc-state-time').exists()).toBe(false);expect(w.get('[aria-label="作答进度"]').text()).not.toBe('');w.unmount()
  }
 })
})
