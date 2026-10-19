import { ref } from 'vue'
import type { MyCoursesQuery } from '../../../api/courses'
import type { Router } from 'vue-router'
export const visualVersion=ref(new URLSearchParams(location.hash.split('?')[1]??'').get('visual')==='v33'?'v33':'v34')
export const previewTerm=ref('')
export const previewCourseStatus=ref<NonNullable<MyCoursesQuery['status']>>('active')
export const previewCoursePage=ref(1)
export function switchVersion(version:'v33'|'v34',router:Router){
 void router.replace({query:{...router.currentRoute.value.query,visual:version}})
}
