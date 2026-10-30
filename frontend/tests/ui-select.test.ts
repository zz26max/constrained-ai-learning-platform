import {describe,it,expect} from 'vitest'
import {mount} from '@vue/test-utils'
import UiSelect from '../src/components/ui/UiSelect.vue'
const options=[
 {value:'',label:'全部课程'},
 {value:'a',label:'高等数学',hint:'软件 2301'},
 {value:'b',label:'数据结构',disabled:true},
 {value:'c',label:'操作系统'},
]
function setup(props:Record<string,unknown>={}){
 return mount(UiSelect,{props:{modelValue:'',options,...props},attachTo:document.body})
}
describe('UiSelect keeps native form semantics behind a custom listbox',()=>{
 it('renders the label, selected text and matching native options',()=>{
  const w=setup({modelValue:'a',label:'课程'})
  expect(w.get('.ui-select-label').text()).toBe('课程')
  expect(w.get('.ui-select-value').text()).toBe('高等数学 · 软件 2301')
  expect(w.get('button').attributes('aria-expanded')).toBe('false')
  expect(w.get('select').findAll('option').map(o=>o.element.value)).toEqual(['','a','b','c'])
  w.unmount()
 })
 it('emits through the hidden native select so existing form bindings keep working',async()=>{
  const w=setup()
  await w.get('select').setValue('c')
  expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['c'])
  w.unmount()
 })
 it('opens a listbox, marks the current option and closes after selection',async()=>{
  const w=setup({modelValue:'a'})
  const trigger=w.get('button')
  await trigger.trigger('click')
  expect(trigger.attributes('aria-expanded')).toBe('true')
  const rows=w.findAll('[role=option]')
  expect(rows).toHaveLength(4)
  expect(rows.map(r=>r.attributes('aria-selected'))).toEqual(['false','true','false','false'])
  await rows[3]!.trigger('click')
  expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['c'])
  expect(w.find('[role=listbox]').exists()).toBe(false)
  w.unmount()
 })
 it('ignores disabled options and disabled triggers',async()=>{
  const w=setup()
  await w.get('button').trigger('click')
  await w.findAll('[role=option]')[2]!.trigger('click')
  expect(w.emitted('update:modelValue')).toBeUndefined()
  expect(w.find('[role=listbox]').exists()).toBe(true)
  w.unmount()
  const off=setup({disabled:true})
  expect(off.get('button').attributes('disabled')).toBeDefined()
  await off.get('button').trigger('click')
  expect(off.find('[role=listbox]').exists()).toBe(false)
  off.unmount()
 })
 it('supports arrow, end, enter, escape and outside dismissal',async()=>{
  const w=setup({modelValue:'a'})
  const trigger=w.get('button')
  await trigger.trigger('keydown',{key:'ArrowDown'})
  expect(trigger.attributes('aria-expanded')).toBe('true')
  expect(trigger.attributes('aria-activedescendant')).toBe(w.findAll('[role=option]')[1]!.attributes('id'))
  await trigger.trigger('keydown',{key:'End'})
  expect(trigger.attributes('aria-activedescendant')).toBe(w.findAll('[role=option]')[3]!.attributes('id'))
  await trigger.trigger('keydown',{key:'Enter'})
  expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['c'])
  await trigger.trigger('keydown',{key:'ArrowDown'})
  await trigger.trigger('keydown',{key:'Escape'})
  expect(w.find('[role=listbox]').exists()).toBe(false)
  await trigger.trigger('keydown',{key:'ArrowDown'})
  document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}))
  await w.vm.$nextTick()
  expect(w.find('[role=listbox]').exists()).toBe(false)
  w.unmount()
 })
})
