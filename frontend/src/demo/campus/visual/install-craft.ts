import {defineComponent,h} from 'vue'
import type {Router} from 'vue-router'
import {visualVersion} from './mode'
import Home from './CraftHome.vue'
import Tasks from './CraftAssignments.vue'
import Messages from './CraftMessages.vue'
import OldHome from './IntegrationHome.vue'
import OldTasks from './IntegrationAssignments.vue'
import OldMessages from './IntegrationMessages.vue'
import Records from './RecordsPreview.vue'
import Courses from './CoursesPreview.vue'
import Calendar from './CalendarPreview.vue'
import './visual.css'
import './refinement.css'
import './integration.css'
import './craft.css'
import './polish.css'
export function installCraftPreview(router:Router){
 router.beforeEach(to=>{if(!['v35','v36','v361'].includes(String(to.query.visual)))return {path:to.path,query:{...to.query,visual:visualVersion.value},hash:to.hash}})
 router.afterEach((to,_from,failure)=>{if(!failure)visualVersion.value=to.query.visual==='v35'?'v35':to.query.visual==='v361'?'v361':'v36'})
 for(const [name,old,newer]of [['student-home',OldHome,Home],['student-assignments',OldTasks,Tasks],['student-messages',OldMessages,Messages]] as const){
  const route=router.getRoutes().find(r=>r.name===name)!
  router.addRoute({name,path:route.path,meta:route.meta,component:defineComponent({setup:()=>()=>h(visualVersion.value!=='v35'?newer:old,{key:visualVersion.value})})})
 }
 for(const [name,component]of [['courses',Courses],['student-progress',Records],['student-progress-select',Records],['student-calendar',Calendar]] as const){
  const route=router.getRoutes().find(r=>r.name===name)!
  router.addRoute({name,path:route.path,meta:route.meta,component:defineComponent({setup:()=>()=>h(component,{refined:true,integrated:true})})})
 }
}
