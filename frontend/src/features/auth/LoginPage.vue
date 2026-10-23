<script setup lang="ts">
import { computed, ref } from 'vue'
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

async function submit(): Promise<void> {
  if (submitting.value) return
  const ok = await auth.login(username.value, password.value)
  if (!ok) return
  // 成功后恢复站内返回路径（FRONTEND.md 4）
  const ret = route.query.return
  const target = typeof ret === 'string' && isInternalPath(ret) ? ret : '/'
  await router.push(target)
}
</script>

<template>
  <div class="auth-page">
  <div class="auth-brand"><span class="auth-mark" aria-hidden="true">知</span><div><strong>知学</strong><small>课程、实践与反馈</small></div></div>
  <section class="auth-panel panel" aria-labelledby="login-title">
    <h1 id="login-title" tabindex="-1">登录知学</h1>
    <p class="auth-hint">使用课程账号登录；账号由任课教师或管理员提供。</p>

    <div v-if="auth.bootStatus === 'error'" class="notice notice-error" role="alert">
      <p>无法连接服务，请确认后端是否已启动。</p>
      <button type="button" class="button secondary" @click="auth.retryBoot()">重试连接</button>
    </div>

    <form class="auth-form" novalidate @submit.prevent="submit">
      <div class="form-field">
        <label for="login-username">用户名</label>
        <input
          id="login-username"
          v-model="username"
          name="username"
          type="text"
          autocomplete="username"
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

      <button type="submit" class="button primary block" :disabled="submitting">
        {{ submitting ? '登录中…' : '登录' }}
      </button>

      <p v-if="failure !== null && auth.lastRequestId !== null" class="request-id">
        requestId: {{ auth.lastRequestId }}
      </p>
    </form>
  </section>
  </div>
</template>
