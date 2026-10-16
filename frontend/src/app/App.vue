<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { API_MODE } from './api-mode'
import { useAuthStore } from '../stores/auth'
import { defaultEntry, isInternalPath } from './router'

const auth = useAuthStore(), router = useRouter(), route = useRoute()
const loggingOut = ref(false)
watch(() => auth.phase, phase => {
  if (phase === 'anonymous' && route.meta.requiresAuth) {
    void router.replace({ name: 'login', query: isInternalPath(route.fullPath) ? { return: route.fullPath } : {} })
  }
})
async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  const ok = await auth.logout()
  loggingOut.value = false
  if (ok) await router.replace({ name: 'login' })
}

// 跳到主要内容：hash 路由下不能用 # 锚点，改为聚焦主区域。
function skipToMain(event: MouseEvent): void {
  event.preventDefault()
  document.getElementById('main-content')?.focus()
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#" @click.prevent="skipToMain">跳到主要内容</a>
    <!-- mock 模式常显标识（FRONTEND.md 1.1），不可关闭 -->
    <header v-if="API_MODE === 'mock'" class="mock-banner" role="status">
      模拟模式 · 全部数据为虚构，不访问真实接口
    </header>
    <div :class="{ 'authenticated-layout': auth.phase === 'authenticated' }">
    <aside v-if="auth.phase === 'authenticated'" class="workspace-sidebar" aria-label="学习空间导航">
      <RouterLink class="workspace-brand" :to="defaultEntry(auth.identity)"><span>学</span><strong>学习空间</strong></RouterLink>
      <nav><RouterLink v-if="auth.identity?.roles.includes('student')" to="/student/home">首页</RouterLink><RouterLink v-if="auth.identity?.roles.includes('student')" to="/course">我的课程</RouterLink><RouterLink v-if="auth.identity?.roles.includes('student')" to="/student/assignments">我的作业</RouterLink><RouterLink v-if="auth.identity?.roles.includes('student')" to="/student/progress">学习记录</RouterLink><RouterLink v-if="auth.identity?.roles.includes('student')" to="/student/messages">消息</RouterLink><RouterLink v-if="auth.identity?.roles.includes('teacher')" to="/teacher">教学班</RouterLink><RouterLink to="/debug/session">会话调试</RouterLink></nav>
      <div class="workspace-user"><span>{{ auth.identity?.displayName }}</span><button class="button secondary" :disabled="loggingOut" @click="logout">退出登录</button><p v-if="auth.logoutFailure" role="alert">{{ auth.logoutFailure }}</p></div>
    </aside>
    <main id="main-content" class="app-main" :class="{ 'business-main': auth.phase === 'authenticated' }" tabindex="-1">
      <RouterView />
    </main>
    </div>
  </div>
</template>
