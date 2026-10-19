import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './CampusDemoShell.vue'
import { installCampusClock } from './clock'
import { createCampusTransport } from './transport'
import { ApiClient } from '../../api/client'
import { AuthApi } from '../../api/auth'
import { router } from '../../app/router'
import {
   registerAuthApi,
  CoursesApi, registerCoursesApi,
  AssignmentsApi, registerAssignmentsApi,
  DashboardApi, registerDashboardApi,
  NoticesApi, registerNoticesApi,
  StatsApi, registerStatsApi,
} from '../../api'
import '../../styles/base.css'
import '../../styles/courses.css'
import '../../styles/teacher.css'
import '../../styles/dashboard.css'
import '../../styles/zhixue.css'
import '../../styles/student-workbench.css'
import '../../styles/calendar.css'
import '../../styles/student-v3.css'

// 先注册请求层（真实或 mock 由 VITE_API_MODE 决定），再装配应用与路由；
// 路由守卫首次导航时会用它恢复会话。
installCampusClock()
const client = new ApiClient(createCampusTransport().transport)
registerAuthApi(new AuthApi(client))
registerCoursesApi(new CoursesApi(client))
registerAssignmentsApi(new AssignmentsApi(client))
registerDashboardApi(new DashboardApi(client))
registerNoticesApi(new NoticesApi(client))
registerStatsApi(new StatsApi(client))
// Opt-in visual exploration changes presentation only within this isolated entry.
if(new URLSearchParams(location.search).get('explore')==='v35'){
 const {installIntegrationPreview}=await import('./visual/install-integration')
 installIntegrationPreview(router)
}else if(new URLSearchParams(location.search).get('explore')==='v34'){
 const {installVisualPreview}=await import('./visual/install')
 installVisualPreview(router)
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
