import { ref } from 'vue'
import type { MyCoursesQuery } from '../../../api/courses'
import type { Router } from 'vue-router'
export type VisualVersion='v33'|'v34'|'v341'|'v35'
const requested=new URLSearchParams(location.hash.split('?')[1]??'').get('visual')
export const visualVersion=ref<VisualVersion>(requested==='v33'||requested==='v341'||requested==='v34'?requested:new URLSearchParams(location.search).get('explore')==='v35'?'v35':'v34')
export const previewTerm=ref('')
export const previewCourseStatus=ref<NonNullable<MyCoursesQuery['status']>>('active')
export const previewCoursePage=ref(1)
export function switchVersion(version:VisualVersion,router:Router){
 void router.replace({query:{...router.currentRoute.value.query,visual:version}})
}
