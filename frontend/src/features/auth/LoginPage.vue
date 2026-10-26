<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isInternalPath } from '../../app/router'
import { useAuthStore, type LoginFailure } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')

const submitting = computed(() => auth.loginStatus === 'loading')
const failure = computed<LoginFailure | null>(() => auth.loginFailure)
const fieldErrors = computed(() =>
  failure.value !== null && failure.value.kind === 'validation' ? failure.value.fields : [],
)

function fieldMessages(name: string): string[] {
  return fieldErrors.value
    .filter((item) => item.field === name)
    .map((item) => item.message)
}

const failureNoticeClass = computed(() => {
  if (failure.value === null) return 'notice-info'
  if (failure.value.kind === 'credentials' || failure.value.kind === 'unavailable') {
    return 'notice-error'
  }
  return 'notice-warn'
})

const currentTermLabel = computed<string | null>(() => {
  const cfg = auth.config
  if (cfg === null) return null
  return cfg.terms.find((term) => term.id === cfg.currentTermId)?.label ?? null
})

async function submit(): Promise<void> {
  if (submitting.value) return
  const ok = await auth.login(username.value, password.value)
  if (!ok) {
    if (failure.value?.kind === 'credentials') {
      await nextTick()
      document.getElementById('login-username')?.focus()
    }
    return
  }
  // 成功后恢复站内返回路径（FRONTEND.md 4）
  const ret = route.query.return
  const target = typeof ret === 'string' && isInternalPath(ret) ? ret : '/'
  await router.push(target)
}
</script>

<template>
  <div class="auth-login">
    <aside class="auth-intro" aria-label="平台信息">
      <div class="auth-identity">
        <span class="auth-mark" aria-hidden="true">知</span>
        <div>
          <strong>知学</strong>
          <small>课程教学平台</small>
        </div>
      </div>
      <section class="auth-section">
        <p class="auth-section-title">系统公告</p>
        <p class="auth-section-body">暂无系统公告</p>
        <p class="auth-note">维护或停课通知会显示在这里</p>
      </section>
      <section class="auth-section">
        <p class="auth-section-title">首次登录</p>
        <ul class="auth-steps">
          <li>账号与初始密码由任课教师或管理员提供</li>
          <li>登录后在「我的课程」用邀请码加入班级</li>
          <li>登录异常请联系任课教师</li>
        </ul>
      </section>
      <p v-if="currentTermLabel" class="auth-term">{{ currentTermLabel }}</p>
    </aside>

    <main class="auth-side">
      <section class="auth-card" aria-labelledby="login-title">
        <h1 id="login-title" tabindex="-1">登录知学</h1>
        <p class="auth-hint">使用课程账号登录。账号由任课教师或管理员提供。</p>

        <div v-if="auth.bootStatus === 'error'" class="notice notice-warn auth-boot" role="alert">
          <p>无法连接服务，请确认后端是否已启动。</p>
          <button type="button" class="button secondary" @click="auth.retryBoot()">重试连接</button>
        </div>

        <form class="auth-form" novalidate @submit.prevent="submit">
          <div class="form-field">
            <label for="login-username">学号 / 工号</label>
            <input
              id="login-username"
              v-model="username"
              name="username"
              type="text"
              autocomplete="username"
              :readonly="submitting"
              :aria-invalid="fieldMessages('username').length > 0 ? 'true' : undefined"
            />
            <p v-for="message in fieldMessages('username')" :key="message" class="field-error">
              {{ message }}
            </p>
          </div>
          <div class="form-field">
            <label for="login-password">密码</label>
            <input
              id="login-password"
              v-model="password"
              name="password"
              type="password"
              autocomplete="current-password"
              :readonly="submitting"
              :aria-invalid="fieldMessages('password').length > 0 ? 'true' : undefined"
            />
            <p v-for="message in fieldMessages('password')" :key="message" class="field-error">
              {{ message }}
            </p>
          </div>

          <p
            v-if="failure !== null && failure.kind !== 'validation'"
            class="notice"
            :class="failureNoticeClass"
            role="alert"
          >
            {{ failure.message }}
          </p>

          <button
            type="submit"
            class="button primary block auth-submit"
            :disabled="submitting"
            :aria-busy="submitting ? 'true' : undefined"
          >
            {{ submitting ? '正在登录…' : '登录' }}
          </button>

          <p v-if="failure !== null && auth.lastRequestId !== null" class="request-id">
            requestId: {{ auth.lastRequestId }}
          </p>
        </form>

        <p class="auth-help">遇到问题请联系任课教师</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.auth-login { min-height: 100vh; width: 100%; display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); font-family: var(--font-sans); color: var(--ink); }
.auth-intro { display: flex; flex-direction: column; justify-content: center; gap: var(--space-6); padding: clamp(24px, 6vw, 64px); background: var(--sunken); border-right: 1px solid var(--line); }
.auth-identity { display: flex; align-items: center; gap: var(--space-3); }
.auth-identity strong { display: block; font-size: 24px; line-height: var(--lh-tight); font-weight: 600; }
.auth-identity small { display: block; font-size: 13px; color: var(--muted); }
.auth-mark { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: var(--radius-control); background: var(--blue); color: var(--surface); font-size: 20px; font-weight: 600; }
.auth-section { max-width: 440px; padding-top: var(--space-4); border-top: 1px solid var(--line-strong); }
.auth-section p { margin: 0; }
.auth-section-title { margin-bottom: var(--space-2) !important; font-size: 13px; font-weight: 600; color: var(--muted); }
.auth-section-body { font-size: 15px; line-height: var(--lh-body); }
.auth-note, .auth-term { font-size: 13px; line-height: var(--lh-body); color: var(--muted); }
.auth-term { margin: 0; }
.auth-steps { margin: 0; padding-left: 1.2em; font-size: 15px; line-height: var(--lh-body); }
.auth-steps li + li { margin-top: var(--space-1); }
.auth-side { display: grid; place-items: center; padding: var(--space-6); background: var(--canvas); }
.auth-card { box-sizing: border-box; width: 100%; max-width: 400px; padding: 40px; background: var(--surface); border-radius: var(--radius-hero); box-shadow: var(--shadow-card); }
.auth-card h1 { margin: 0; font-size: var(--fs-h2); line-height: var(--lh-tight); font-weight: 600; }
.auth-card h1:focus { outline: none; }
.auth-hint { margin: var(--space-2) 0 var(--space-5); font-size: 13px; line-height: var(--lh-body); color: var(--muted); }
.auth-form { display: grid; gap: var(--space-4); }
.form-field { display: grid; gap: var(--space-2); }
.form-field label { font-size: 13px; font-weight: 600; }
.form-field input { box-sizing: border-box; width: 100%; height: 44px; padding: 0 var(--space-3); border: 1px solid var(--line-control); border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit; font-size: 15px; }
.form-field input:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.form-field input[readonly] { background: var(--sunken); color: var(--muted); }
.form-field input[aria-invalid="true"] { border: 2px solid var(--red); padding: 0 calc(var(--space-3) - 1px); }
.auth-card:has(.notice-error) .form-field input { border-color: var(--red); border-width: 2px; padding: 0 calc(var(--space-3) - 1px); }
.field-error { margin: 0; font-size: 13px; color: var(--red); }
.notice[role="alert"] { margin: 0; padding: var(--space-2) var(--space-3); border: 0; border-left: 3px solid transparent; border-radius: var(--radius-control); font-size: 13px; line-height: var(--lh-body); color: var(--ink); }
.notice-error[role="alert"] { background: var(--red-soft); border-left-color: var(--red); }
.notice-warn[role="alert"] { background: var(--orange-soft); border-left-color: var(--orange); }
.auth-boot { display: grid; gap: var(--space-2); justify-items: start; margin-bottom: var(--space-4) !important; }
.auth-boot p { margin: 0; }
.auth-submit { height: 44px; width: 100%; }
.auth-submit[aria-busy="true"] { cursor: progress; }
.request-id { margin: 0; font-size: 12px; color: var(--muted); word-break: break-all; }
.auth-help { margin: var(--space-5) 0 0; padding-top: var(--space-4); border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
@media (max-width: 959px) {
  .auth-login { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .auth-intro { min-height: 88px; box-sizing: border-box; padding: var(--space-4); border-right: 0; border-bottom: 1px solid var(--line); }
  .auth-intro > .auth-section, .auth-intro > .auth-term { display: none; }
  .auth-side { place-items: start center; padding: var(--space-4); }
  .auth-card { max-width: none; padding: 20px; border-radius: 0; box-shadow: none; }
}
</style>
