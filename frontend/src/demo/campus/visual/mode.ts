import { ref } from 'vue'
import type { MyCoursesQuery } from '../../../api/courses'
import type { Router } from 'vue-router'
export type VisualVersion='v33'|'v34'|'v341'|'v35'|'v36'|'v361'
const requested=new URLSearchParams(location.hash.split('?')[1]??'').get('visual')
const entry=new URLSearchParams(location.search).get('explore')
const allowed:VisualVersion[]=entry==='v361'?['v36','v361']:entry==='v36'?['v35','v36']:entry==='v35'?['v33','v34','v341','v35']:['v33','v34','v341']
export const visualVersion=ref<VisualVersion>(allowed.includes(requested as VisualVersion)?requested as VisualVersion:entry==='v361'?'v361':entry==='v36'?'v36':entry==='v35'?'v35':'v34')
export const previewTerm=ref('')
export const previewCourseStatus=ref<NonNullable<MyCoursesQuery['status']>>('active')
export const previewCoursePage=ref(1)
export function switchVersion(version:VisualVersion,router:Router){
 void router.replace({query:{...router.currentRoute.value.query,visual:version}})
}
