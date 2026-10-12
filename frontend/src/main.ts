import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app/App.vue'
import { router } from './app/router'
import { createDefaultAuthApi, registerAuthApi } from './api'
import './styles/base.css'

// 先注册请求层（真实或 mock 由 VITE_API_MODE 决定），再装配应用与路由；
// 路由守卫首次导航时会用它恢复会话。
registerAuthApi(await createDefaultAuthApi())

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
