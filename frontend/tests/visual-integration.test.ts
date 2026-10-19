import {describe,it,expect,vi,afterEach} from 'vitest'
import {mount} from '@vue/test-utils'
import TaskStatus from '../src/demo/campus/visual/IntegratedTaskStatus.vue'
import SubjectIdentity from '../src/demo/campus/visual/SubjectIdentity.vue'
import MessageTypeGlyph from '../src/demo/campus/visual/MessageTypeGlyph.vue'
import {createCampusState} from '../src/demo/campus/data'
import {DEMO_EPOCH} from '../src/demo/campus/clock'

afterEach(()=>vi.useRealTimers())
describe('integrated presentation separates identity, deadline and permission',()=>{
 it('does not present a permission inferred from a due date',()=>{
  vi.useFakeTimers();vi.setSystemTime(DEMO_EPOCH)
  const task=createCampusState().assignments.find(a=>a.overdue&&a.canSubmit)!
  const wrapper=mount(TaskStatus,{props:{task}})
  expect(wrapper.text()).toContain('已截止');expect(wrapper.text()).toContain('提交资格未确认');expect(wrapper.text()).not.toContain('允许补交');wrapper.unmount()
 })
 it('distinguishes late submission from an expired blocked task with text',()=>{
  const tasks=createCampusState().assignments
  for(const [task,label] of [[tasks.find(a=>a.overdue&&a.canSubmit)!,'允许补交'],[tasks.find(a=>a.overdue&&!a.canSubmit)!,'暂不可提交']] as const){
   const wrapper=mount(TaskStatus,{props:{task,detail:task}});expect(wrapper.text()).toContain(label);expect(wrapper.text()).toContain('进度');expect(wrapper.text()).toContain('时间');expect(wrapper.text()).toContain('资格');wrapper.unmount()
  }
 })
 it('keeps archived read-only status even if a supplied permission is true',()=>{
  const task={...createCampusState().assignments[0]!,publicationState:'archived' as const,canSubmit:true}
  const wrapper=mount(TaskStatus,{props:{task,detail:task}});expect(wrapper.text()).toContain('已归档 · 只读');expect(wrapper.text()).not.toContain('允许补交');wrapper.unmount()
 })
 it('does not guess subject family from a title',()=>{
  const wrapper=mount(SubjectIdentity,{props:{course:{mark:'OTHER',title:'Java 标题不是分类依据'}}});expect(wrapper.get('[data-family]').attributes('data-family')).toBe('neutral');wrapper.unmount()
 })
 it('does not invent a course when the association is unavailable',()=>{
  const wrapper=mount(SubjectIdentity);expect(wrapper.text()).toContain('课程信息未返回');expect(wrapper.get('[data-family]').attributes('data-family')).toBe('neutral');wrapper.unmount()
 })
 it('gives different event types distinct shapes independently of a course color',()=>{
  const shapes=['assignment_published','feedback','course_notice','system','help_reply'].map(type=>{const wrapper=mount(MessageTypeGlyph,{props:{type:type as 'system'}});const shape=wrapper.get('path').attributes('d');expect(wrapper.attributes('aria-hidden')).toBe('true');wrapper.unmount();return shape})
  expect(new Set(shapes).size).toBe(5)
 })
})
