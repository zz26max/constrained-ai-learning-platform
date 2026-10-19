import {defineComponent,h} from 'vue'
import type {Router} from 'vue-router'
import {visualVersion} from './mode'
import Home from './IntegrationHome.vue'
import Tasks from './IntegrationAssignments.vue'
import Messages from './IntegrationMessages.vue'
import HomeBaseline from '../../../features/dashboard/StudentHomePage.vue'
import TasksBaseline from '../../../features/assignments/AssignmentList.vue'
import MessagesBaseline from '../../../features/notifications/NotificationCenter.vue'
import Records from './RecordsPreview.vue'
import RecordsBaseline from '../../../features/dashboard/LearningRecordsPage.vue'
import Courses from './CoursesPreview.vue'
import CoursesBaseline from './CoursesBaseline.vue'
import Calendar from './CalendarPreview.vue'
import CalendarBaseline from '../../../features/calendar/AssignmentCalendar.vue'
import './visual.css'
import './refinement.css'
import './integration.css'
export function installIntegrationPreview(router:Router){
 router.beforeEach(to=>{if(!['v33','v34','v341','v35'].includes(String(to.query.visual)))return {path:to.path,query:{...to.query,visual:visualVersion.value},hash:to.hash}})
 router.afterEach((to,_from,failure)=>{if(!failure)visualVersion.value=to.query.visual==='v33'?'v33':to.query.visual==='v34'?'v34':to.query.visual==='v341'?'v341':'v35'})
 for(const [name,old,newer] of [['student-home',HomeBaseline,Home],['student-assignments',TasksBaseline,Tasks],['student-messages',MessagesBaseline,Messages]] as const){
  const route=router.getRoutes().find(r=>r.name===name)!
  router.addRoute({name,path:route.path,meta:route.meta,component:defineComponent({setup:()=>()=>h(visualVersion.value==='v35'?newer:old,{key:visualVersion.value})})})
 }
 for(const [name,candidate,baseline] of [['courses',Courses,CoursesBaseline],['student-progress',Records,RecordsBaseline],['student-progress-select',Records,RecordsBaseline],['student-calendar',Calendar,CalendarBaseline]] as const){
  const route=router.getRoutes().find(r=>r.name===name)!
  router.addRoute({name,path:route.path,meta:route.meta,component:defineComponent({setup:()=>()=>h(visualVersion.value==='v33'?baseline:candidate,{key:visualVersion.value,refined:['v341','v35'].includes(visualVersion.value),integrated:visualVersion.value==='v35'})})})
 }
}
