import { defineComponent, h } from 'vue'
import type { Router } from 'vue-router'
import RecordsPreview from './RecordsPreview.vue'
import RecordsBaseline from '../../../features/dashboard/LearningRecordsPage.vue'
import CoursesPreview from './CoursesPreview.vue'
import CoursesBaseline from './CoursesBaseline.vue'
import CalendarPreview from './CalendarPreview.vue'
import CalendarBaseline from '../../../features/calendar/AssignmentCalendar.vue'
import { visualVersion } from './mode'
import './visual.css'
export function installVisualPreview(router:Router){
 router.beforeEach(to=>{
  if(to.query.visual!=='v33'&&to.query.visual!=='v34')return {path:to.path,query:{...to.query,visual:visualVersion.value},hash:to.hash}
 })
 router.afterEach((to,_from,failure)=>{if(!failure)visualVersion.value=to.query.visual==='v33'?'v33':'v34'})
 for(const [name,candidate,baseline] of [['student-progress',RecordsPreview,RecordsBaseline],['student-progress-select',RecordsPreview,RecordsBaseline],['courses',CoursesPreview,CoursesBaseline],['student-calendar',CalendarPreview,CalendarBaseline]] as const){
  const route=router.getRoutes().find(r=>r.name===name)!
  router.addRoute({name,path:route.path,meta:route.meta,component:defineComponent({name:'VisualComparison',setup:()=>()=>h(visualVersion.value==='v34'?candidate:baseline,{key:visualVersion.value})})})
 }
}
