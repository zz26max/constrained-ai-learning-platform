import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app/App.vue'
import { router } from './app/router'
import {
  createDefaultAuthApi, registerAuthApi,
  createDefaultCoursesApi, registerCoursesApi,
  createDefaultAssignmentsApi, registerAssignmentsApi,
  createDefaultDashboardApi, registerDashboardApi,
  createDefaultNoticesApi, registerNoticesApi,
  createDefaultStatsApi, registerStatsApi,
  createDefaultTutoringApi, registerTutoringApi,
} from './api'
import './styles/base.css'
import './styles/courses.css'
import './styles/teacher.css'
import './styles/dashboard.css'
import './styles/zhixue.css'
import './styles/student-workbench.css'
import './styles/calendar.css'
import './styles/student-v3.css'
import './features/student/visual/student.css'
import './features/student/release/release.css'
import './styles/motion.css'

// 先注册请求层（真实或 mock 由 VITE_API_MODE 决定），再装配应用与路由；
// 路由守卫首次导航时会用它恢复会话。
registerAuthApi(await createDefaultAuthApi())
registerCoursesApi(await createDefaultCoursesApi())
registerAssignmentsApi(await createDefaultAssignmentsApi())
registerDashboardApi(await createDefaultDashboardApi())
registerNoticesApi(await createDefaultNoticesApi())
registerStatsApi(await createDefaultStatsApi())
registerTutoringApi(await createDefaultTutoringApi())

const app = createApp(App,{studentVisual:true})
app.use(createPinia())
app.use(router)
app.mount('#app')
