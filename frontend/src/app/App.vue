<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { API_MODE } from './api-mode'
import { useAuthStore } from '../stores/auth'
import { defaultEntry, isInternalPath } from './router'
import AppIcon from '../components/AppIcon.vue'

defineProps<{studentVisual?:boolean}>()
const auth = useAuthStore(), router = useRouter(), route = useRoute()
const loggingOut = ref(false), menuOpen = ref(false), menuTrigger = ref<HTMLButtonElement | null>(null)
const dualRole = computed(() => auth.identity?.roles.includes('student') && auth.identity.roles.includes('teacher'))
const role = computed(() => route.path.startsWith('/teacher') ? 'teacher' : auth.identity?.roles.includes('student') ? 'student' : auth.identity?.roles.includes('teacher') ? 'teacher' : 'account')
const roleLabel = computed(()=>role.value==='teacher'?'教师':role.value==='student'?'学生':'账号')
const studentNav = [
  {to:'/student/home', label:'学习首页', icon:'home', active: () => route.path === '/student/home'},
  {to:'/course', label:'我的课程', icon:'book', active: () => route.path.startsWith('/course') || route.path.startsWith('/resource') || route.path.startsWith('/student/notices') || route.path.includes('/notices')},
  {to:'/student/assignments', label:'我的作业', icon:'clipboard', active: () => route.path.startsWith('/student/assignments') || route.path.startsWith('/student/workspaces')},
  {to:'/student/progress', label:'学习记录', icon:'chart', active: () => route.path.startsWith('/student/progress')},
  {to:'/student/calendar', label:'学习日历', icon:'calendar', active: () => route.path === '/student/calendar'},
  {to:'/student/messages', label:'消息通知', icon:'bell', active: () => route.path === '/student/messages'},
  {to:'/student/help-requests', label:'我的求助', icon:'help', active: () => route.path.startsWith('/student/help-requests')},
]
const teacherNav = [
  {to:'/teacher', label:'教学工作台', icon:'home', active: () => route.path === '/teacher'},
  {to:'/teacher', label:'课程管理', icon:'book', active: () => route.path.startsWith('/teacher/offerings') || route.path.startsWith('/teacher/assignments') || route.path.startsWith('/teacher/submissions')},
  {to:'/teacher/calendar', label:'教学日历', icon:'calendar', active: () => route.path === '/teacher/calendar'},
]
const nav = computed(() => role.value === 'teacher' ? teacherNav : role.value === 'student' ? studentNav : [])
const location = computed(() => route.path.includes('/teacher/assignments') || route.path.includes('/teacher/submissions') ? '作业与批阅' : nav.value.find(item => item.active())?.label ?? '账号信息')
watch(() => auth.phase, phase => {
  if (phase === 'anonymous' && route.meta.requiresAuth) void router.replace({ name: 'login', query: isInternalPath(route.fullPath) ? { return: route.fullPath } : {} })
})
// 记录打开菜单的按钮：手机端顶栏按钮隐藏，焦点需回到底部"更多"。
let menuOpener: HTMLElement | null = null
function toggleMenu(e: Event) { menuOpener = e.currentTarget as HTMLElement; menuOpen.value = !menuOpen.value }
function closeMenu() { if (menuOpen.value) { menuOpen.value = false; void nextTick(() => (menuOpener ?? menuTrigger.value)?.focus()) } }
watch(() => route.fullPath, closeMenu)
function keydown(e: KeyboardEvent) { if(e.key === 'Escape') closeMenu() }
watch(menuOpen, async value => { if(value) { await nextTick(); document.querySelector<HTMLElement>('.workspace-sidebar nav a')?.focus() } })
window.addEventListener('keydown', keydown)
onBeforeUnmount(() => window.removeEventListener('keydown', keydown))
async function logout() {
  if(loggingOut.value) return
  loggingOut.value = true
  const ok = await auth.logout()
  loggingOut.value = false
  if(ok) await router.replace({name:'login'})
}
function skipToMain() { document.getElementById('main-content')?.focus() }
</script>
<template>
  <div class="app-shell" :class="{'student-space':auth.phase==='authenticated' && role==='student','student-release':studentVisual && auth.phase==='authenticated' && role==='student'}">
    <a class="skip-link" href="#" @click.prevent="skipToMain">跳到主要内容</a>
    <header v-if="API_MODE === 'mock'" class="mock-banner" role="status">模拟模式 · 全部数据为虚构，不访问真实接口</header>
    <div :class="{'authenticated-layout':auth.phase === 'authenticated'}">
      <button v-if="menuOpen" class="sidebar-backdrop" aria-label="关闭导航" @click="closeMenu" />
      <aside v-if="auth.phase === 'authenticated'" class="workspace-sidebar" :class="{'is-open':menuOpen}" aria-label="知学导航">
        <RouterLink class="workspace-brand" :to="defaultEntry(auth.identity)"><span>知</span><div><strong>知学</strong><small>让每一步学习有迹可循</small></div></RouterLink>
        <label v-if="dualRole" class="role-select">工作空间<select :value="role" @change="router.push(($event.target as HTMLSelectElement).value === 'teacher' ? '/teacher' : '/student/home')"><option value="student">学生工作空间</option><option value="teacher">教师工作空间</option></select></label>
        <p v-else class="sidebar-role">{{roleLabel}}工作空间</p>
        <nav aria-label="主导航"><RouterLink v-for="item in nav" :key="item.label" :to="item.to" custom v-slot="{href,navigate}"><a :href="href" class="nav-item" :class="{'is-active':item.active()}" :aria-current="item.active() ? 'page' : undefined" @click="navigate"><AppIcon :name="item.icon" />{{ item.label }}</a></RouterLink></nav>
        <div class="workspace-user"><span class="user-avatar">{{ auth.identity?.displayName.slice(0,1) }}</span><div><strong>{{ auth.identity?.displayName }}</strong><small>{{roleLabel}}</small></div><button class="button secondary" :disabled="loggingOut" @click="logout">退出</button><p v-if="auth.logoutFailure" role="alert">{{ auth.logoutFailure }}</p></div>
      </aside>
      <div class="workspace-body">
        <header v-if="auth.phase === 'authenticated'" class="workspace-topbar"><button ref="menuTrigger" class="menu-toggle" :aria-expanded="menuOpen" aria-label="打开导航" @click="toggleMenu"><AppIcon name="menu" /></button><span>{{roleLabel}}工作空间 <span class="crumb-divider">/</span> {{ location }}</span><div class="topbar-account"><span class="muted">{{ auth.config?.terms.find(t=>t.id === auth.config?.currentTermId)?.label }}</span><span class="user-avatar">{{ auth.identity?.displayName.slice(0,1) }}</span></div></header>
        <main id="main-content" class="app-main" :class="{'business-main':auth.phase === 'authenticated'}" tabindex="-1"><RouterView /></main>
        <footer v-if="auth.phase === 'authenticated'" class="workspace-footer"><span>知学 · 专注学习，从容成长</span><span>课程、实践与反馈</span></footer>
      </div>
    </div>
    <nav v-if="auth.phase==='authenticated' && role==='student'" class="mobile-primary-nav" aria-label="手机主导航">
      <RouterLink v-for="item in [studentNav[0]!,studentNav[2]!,studentNav[1]!,studentNav[5]!]" :key="item.to" :to="item.to" :aria-current="item.active()?'page':undefined"><AppIcon :name="item.icon" />{{ item.label.replace('学习首页','首页').replace('我的','').replace('消息通知','消息') }}</RouterLink>
      <button :aria-expanded="menuOpen" aria-label="更多导航" @click="toggleMenu"><AppIcon name="menu" />更多</button>
    </nav>
  </div>
</template>
