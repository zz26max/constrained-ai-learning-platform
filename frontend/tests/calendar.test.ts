import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import App from '../src/app/App.vue'
import { createAppRouter } from '../src/app/router'
import { registerAuthApi, registerCoursesApi, registerAssignmentsApi } from '../src/api'
import { AuthApi } from '../src/api/auth'
import { CoursesApi } from '../src/api/courses'
import { AssignmentsApi } from '../src/api/assignments'
import { ApiClient } from '../src/api/client'
import { useAuthStore } from '../src/stores/auth'
import { addDays, beijingDay, monthDays, shiftMonth, validDay, weekDays } from '../src/features/calendar/dates'
import { createScriptedTransport, DEMO_CONFIG, DEMO_USER, okEnvelope, failEnvelope } from './helpers'
const offering='00000000-0000-4000-8000-000000000201'
let wrapper:VueWrapper|undefined
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.restoreAllMocks()})
describe('北京时间日历',()=>{
  it('午夜、跨年周一、闰月与月末切换',()=>{
    expect(beijingDay('2026-10-18T16:00:00Z')).toBe('2026-10-19')
    expect(beijingDay('2026-10-18T15:59:59Z')).toBe('2026-10-18')
    expect(weekDays('2027-01-03')[0]).toBe('2026-12-28')
    expect(weekDays('2027-01-04')[0]).toBe('2027-01-04')
    expect(monthDays('2028-02-01')).toContain('2028-02-29')
    expect(monthDays('2028-02-01').length%7).toBe(0)
    expect(shiftMonth('2026-01-31',1)).toBe('2026-02-01')
    expect(shiftMonth('2026-12-31',1)).toBe('2027-01-01')
    expect(addDays('2028-02-28',2)).toBe('2028-03-01')
    expect(validDay('2026-02-30')).toBe(false)
  })
  it('空日期仅从完整真实日程选择后续已发布项，日期跳转保留筛选',async()=>{
    vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-19T00:00:00Z'))
    const transport=createScriptedTransport()
    transport.setHandler(r=>{
      if(r.operationId==='listMyCourses')return okEnvelope({items:[{offeringId:offering,title:'真实课程',groupName:'一班'}],total:1})
      if(r.operationId==='listMyAssignments')return okEnvelope({items:[
        {id:'archived',offeringId:offering,title:'旧归档',dueAt:'2026-10-20T00:00:00Z',publicationState:'archived'},
        {id:'next',offeringId:offering,title:'真实下一日程',dueAt:'2026-10-21T00:00:00Z',publicationState:'published'},
      ],total:2})
      throw new Error(r.operationId)
    })
    const c=new ApiClient(transport.transport)
    registerAuthApi(new AuthApi(c));registerCoursesApi(new CoursesApi(c));registerAssignmentsApi(new AssignmentsApi(c))
    const pinia=createPinia();setActivePinia(pinia)
    useAuthStore().$patch({phase:'authenticated',bootStatus:'success',csrfToken:'test',identity:{...DEMO_USER,roles:['student']},config:{...DEMO_CONFIG,terms:[]}})
    const router=createAppRouter(createMemoryHistory());await router.push(`/student/calendar?date=2026-10-19&offering=${offering}&view=week`);await router.isReady()
    wrapper=mount(App,{global:{plugins:[pinia,router]}});await flushPromises()
    expect(wrapper.find('.vx-calendar-empty:has(h4)').text()).toContain('真实下一日程')
    expect(wrapper.find('.vx-calendar-empty:has(h4)').text()).not.toContain('旧归档')
    await wrapper.find('.vx-calendar-empty:has(h4) button').trigger('click');await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({date:'2026-10-21',offering,view:'week'})
    expect(wrapper.find('.vx-calendar-empty:has(h4)').exists()).toBe(false)
    expect(wrapper.find('.vx-agenda').text()).toContain('真实下一日程')
    await router.push(`/student/calendar?date=2027-01-01&offering=${offering}`);await flushPromises()
    expect(wrapper.find('.vx-calendar-empty:has(h4)').exists()).toBe(false)
    expect(wrapper.text()).toContain('当天暂无截止日程')
    router.options.history.destroy()
  })
  it('读取所有作业分页；第二页失败显示不完整而非当天无日程，重试恢复',async()=>{
    let failed=true
    const transport=createScriptedTransport()
    transport.setHandler(r=>{
      if(r.operationId==='listMyCourses')return okEnvelope({items:[{offeringId:offering,title:'真实课程',groupName:'一班'}],total:1})
      if(r.operationId==='listMyAssignments'){
        const p=Number(new URL(r.path,'http://localhost').searchParams.get('page'))
        if(p===2&&failed)return failEnvelope(500,'INTERNAL_ERROR',{},'calendar-page2')
        return okEnvelope({items:[{id:'a'+p,offeringId:offering,title:'第'+p+'页作业',dueAt:'2026-10-18T16:00:00Z',publicationState:p===2?'archived':'published'}],total:2})
      }
      throw new Error(r.operationId)
    })
    const c=new ApiClient(transport.transport)
    registerAuthApi(new AuthApi(c));registerCoursesApi(new CoursesApi(c));registerAssignmentsApi(new AssignmentsApi(c))
    const pinia=createPinia();setActivePinia(pinia)
    useAuthStore().$patch({phase:'authenticated',bootStatus:'success',csrfToken:'test',identity:{...DEMO_USER,roles:['student']},config:{...DEMO_CONFIG,terms:[]}})
    const router=createAppRouter(createMemoryHistory());await router.push('/student/calendar?date=2026-10-19&view=week');await router.isReady()
    wrapper=mount(App,{global:{plugins:[pinia,router]}});await flushPromises()
    expect(wrapper.text()).toContain('日程未完整加载')
    expect(wrapper.text()).not.toContain('当天暂无截止日程')
    failed=false
    await wrapper.findAll('button').find(b=>b.text()==='重新加载')?.trigger('click');await flushPromises()
    expect(wrapper.find('.vx-agenda').text()).toContain('第2页作业')
    expect(wrapper.find('.vx-agenda').text()).toContain('已归档')
    expect(wrapper.findAll('.vx-desktop-calendar .vx-day-cell')).toHaveLength(7)
    await wrapper.findAll('button').find(b=>b.text()==='下一周')?.trigger('click');await flushPromises()
    expect(router.currentRoute.value.query.date).toBe('2026-10-26')
    expect(router.currentRoute.value.query.view).toBe('week')
    router.options.history.destroy()
  })
})
