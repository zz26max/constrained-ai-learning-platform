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
const showPassword = ref(false)
const year = new Date().getFullYear()

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
    <aside class="login-brand-panel" aria-label="知学平台介绍">
      <div class="login-lock">
        <span class="brand-mark" aria-hidden="true">知</span>
        <span class="brand-name"><b>知学</b><small>学习平台</small></span>
      </div>
      <div class="lp-body">
        <p class="lp-lead">每一次尝试，<br /><span>都值得记录。</span></p>
        <p class="lp-sub">提问、修改和卡住的地方都会留下记录，帮你看清自己是怎么一步步学会的。</p>
        <figure class="lp-path">
          <svg viewBox="0 0 640 150" aria-hidden="true" focusable="false">
            <path class="lp-line" d="M40 132H120L180 112H280L340 86H440L500 58H560" pathLength="100" />
            <circle class="lp-ring" cx="560" cy="58" r="14" />
            <circle class="lp-dot" style="--d: 0.55s" cx="80" cy="132" r="4.5" />
            <circle class="lp-dot" style="--d: 1s" cx="240" cy="112" r="4.5" />
            <circle class="lp-dot" style="--d: 1.4s" cx="400" cy="86" r="4.5" />
            <circle class="lp-dot lp-dot-end" style="--d: 1.8s" cx="560" cy="58" r="6.5" />
          </svg>
          <figcaption class="lp-steps">
            <span>读要求</span><span>问 AI</span><span>自己写</span><span>看反馈</span>
          </figcaption>
        </figure>
      </div>
      <p class="lp-foot">账号由学校统一发放 · 仅限本校师生</p>
    </aside>

    <main class="login-pane">
      <section class="login-card" aria-labelledby="login-title">
        <p class="login-eyebrow">课程教学平台</p>
        <h1 id="login-title" tabindex="-1">登录</h1>
        <p class="login-sub">使用学校统一账号（学号 / 工号）登录。</p>

        <div v-if="auth.bootStatus === 'error'" class="notice notice-warn login-boot" role="alert">
          <p>无法连接服务，请确认后端是否已启动。</p>
          <button type="button" class="button secondary" @click="auth.retryBoot()">重试连接</button>
        </div>

        <form class="auth-form login-form" novalidate @submit.prevent="submit">
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
            <div class="password-control">
              <input
                id="login-password"
                v-model="password"
                name="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                :readonly="submitting"
                :aria-invalid="fieldMessages('password').length > 0 ? 'true' : undefined"
              />
              <button
                type="button"
                class="password-toggle"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? '隐藏' : '显示' }}
              </button>
            </div>
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
            class="button primary login-submit"
            :disabled="submitting"
            :aria-busy="submitting ? 'true' : undefined"
          >
            {{ submitting ? '正在登录…' : '登录' }}
          </button>

          <p v-if="failure !== null && auth.lastRequestId !== null" class="request-id">
            requestId: {{ auth.lastRequestId }}
          </p>
        </form>

        <p class="login-note">请使用本人账号登录；遇到问题请联系任课教师或管理员。</p>
        <p class="login-register-link">
          还没有账号？<router-link :to="{ name: 'register' }">自助注册</router-link>
        </p>
      </section>
      <footer class="login-legal">© {{ year }} 知学学习平台 · 仅限本校师生使用</footer>
    </main>
  </div>
</template>

<style scoped>
.auth-login {
  --canvas: #f4f6f9;
  --surface: #fff;
  --ink: #1c2d49;
  --muted: #52627a;
  --line: #dde3ec;
  --line-control: #8993a0;
  --blue: #2853bc;
  --blue-hover: #2147a3;
  --red: #b42d24;
  --red-soft: #fdf0ee;
  --orange: #8a5208;
  --orange-soft: #fbf3e6;
  --focus-ring: #1f3b84;
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(404px, 2fr);
  min-height: 100vh;
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-sans);
}

/* 品牌栏：唯一深色区域，承担产品气质；学习路径只用一条折线与四个节点 */
.login-brand-panel {display: flex; flex-direction: column; gap: 30px; min-width: 0; padding: 42px 56px 24px; background: var(--ink); color: #fff}
.login-lock {display: flex; align-items: center; gap: 11px}
.brand-mark {display: grid; place-items: center; width: 34px; height: 34px; border-radius: var(--radius-control); background: #fff; color: var(--ink); font-size: 16px; font-weight: 700}
.brand-name {display: grid; line-height: 1.25}
.brand-name b {font-size: 17px; font-weight: 700; letter-spacing: .4px}
.brand-name small {font-size: 11.5px; color: #ffffff8f; letter-spacing: .3px}
.lp-body {display: grid; align-content: center; gap: 24px; max-width: 680px; margin: auto 0}
.lp-lead {margin: 0; font-size: clamp(38px, 3.7vw, 58px); font-weight: 600; line-height: 1.3; letter-spacing: .01em}
.lp-lead span {color: #ffffff8f}
.lp-sub {max-width: 27em; margin: 0; font-size: 15px; line-height: 1.8; color: #ffffffa3}
.lp-path {margin: 8px 0 0}
.lp-path svg {display: block; width: 100%; height: auto; overflow: visible}
.lp-line {fill: none; stroke: #ffffff61; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 100; vector-effect: non-scaling-stroke}
.lp-dot {fill: #fff}
.lp-dot, .lp-ring {transform-box: fill-box; transform-origin: center}
.lp-ring {fill: none; stroke: #ffffff6b; stroke-width: 1.4}
.lp-steps {display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 12px; font-size: 12.5px; color: #ffffff8a}
.lp-steps span {text-align: center}
.lp-foot {margin: 0; font-size: 12px; color: #ffffff8c}
.lp-lead {animation: login-rise .5s cubic-bezier(.2, .7, .2, 1) .04s both}
.lp-sub {animation: login-rise .5s cubic-bezier(.2, .7, .2, 1) .12s both}
.lp-line {animation: login-draw 1.5s cubic-bezier(.5, .1, .2, 1) .3s both}
.lp-dot {animation: login-pop .45s cubic-bezier(.2, .7, .2, 1) var(--d, .5s) both}
.lp-ring {animation: login-ring .55s ease 1.95s both}
.lp-steps span {animation: login-rise .45s ease both}
.lp-steps span:nth-child(1) {animation-delay: .6s}
.lp-steps span:nth-child(2) {animation-delay: 1.05s}
.lp-steps span:nth-child(3) {animation-delay: 1.45s}
.lp-steps span:nth-child(4) {animation-delay: 1.85s}
@keyframes login-draw {from {stroke-dashoffset: 100} to {stroke-dashoffset: 0}}
@keyframes login-pop {from {opacity: 0; transform: scale(.3)} to {opacity: 1; transform: none}}
@keyframes login-ring {from {opacity: 0; transform: scale(.7)} to {opacity: 1; transform: none}}
@keyframes login-rise {from {opacity: 0; transform: translateY(12px)} to {opacity: 1; transform: none}}
@media (prefers-reduced-motion: reduce) {
  .lp-lead, .lp-sub, .lp-line, .lp-dot, .lp-ring, .lp-steps span {animation: none}
}

/* 表单栏：登录卡是唯一白面，1px 细边代替阴影 */
.login-pane {display: grid; grid-template-rows: 1fr auto; place-items: center; min-width: 0; padding: 40px 32px 24px}
.login-card {width: min(432px, 100%); padding: 34px 36px 30px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; animation: login-rise .55s cubic-bezier(.2, .7, .2, 1) .08s both}
.login-eyebrow {margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .1em; color: var(--blue)}
.login-card h1 {margin: 12px 0 0; font-size: 30px; font-weight: 700; line-height: var(--lh-tight); letter-spacing: .5px}
.login-sub {margin: 8px 0 0; font-size: 13.5px; line-height: 1.6; color: var(--muted)}
.login-form {display: grid; gap: 16px; margin-top: 26px}
.form-field {display: grid; gap: 7px}
.form-field label {font-size: 13px; font-weight: 600; line-height: 1.4}
.form-field input {width: 100%; height: 48px; padding: 0 14px; border: 1px solid var(--line-control); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; font-size: 15px}
.form-field input:focus-visible {outline: 2px solid var(--focus-ring); outline-offset: 1px}
.form-field input[readonly] {background: #f7f9fc; color: var(--muted)}
.form-field input[aria-invalid="true"] {border-color: var(--red); background: var(--red-soft)}
.form-field input[aria-invalid="true"]:focus-visible {outline-color: var(--red)}
.password-control {position: relative}
.password-control input {padding-right: 64px}
.password-toggle {position: absolute; top: 50%; right: 3px; min-height: 40px; padding: 0 10px; border: 0; border-radius: 5px; background: none; color: var(--muted); font-size: 12px; cursor: pointer; transform: translateY(-50%)}
.password-toggle:hover {background: #f7f9fc; color: var(--ink)}
.password-toggle:focus-visible {outline: 2px solid var(--focus-ring); outline-offset: 1px}
.field-error {margin: 0; color: var(--red); font-size: 13px}
.notice[role="alert"] {margin: 0; padding: 8px 10px; border: 0; border-radius: 4px; font-size: 13px; line-height: 1.55}
.notice-error[role="alert"] {background: var(--red-soft); color: var(--red)}
.notice-warn[role="alert"] {background: var(--orange-soft); color: var(--orange)}
.login-boot {display: grid; gap: 8px; justify-items: start; margin-top: 20px !important}
.login-boot p {margin: 0}
.login-boot .button {min-height: 36px; padding: 0 12px; font-size: 13px}
.login-submit {width: 100%; min-height: 48px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: .02em}
.login-submit[aria-busy="true"] {opacity: .75; cursor: progress}
.request-id {text-align: left}
.login-note {margin: 20px 0 0; padding-top: 16px; border-top: 1px solid var(--line); font-size: 12px; line-height: 1.7; color: var(--muted)}
.login-register-link {margin: 12px 0 0; font-size: 13px; color: var(--muted)}
.login-register-link a {color: var(--blue); text-decoration: none; font-weight: 500}
.login-register-link a:hover {text-decoration: underline}
.login-legal {margin-top: 20px; font-size: 12px; color: var(--muted)}

@media (max-width: 1100px) and (min-width: 981px) {
  .login-brand-panel {padding: 32px 36px 20px}
  .login-pane {padding: 32px 24px 20px}
  .login-card {padding: 30px 30px 26px}
}
@media (max-height: 780px) and (min-width: 981px) {
  .login-brand-panel {gap: 24px; padding-top: 30px; padding-bottom: 18px}
  .lp-body {gap: 18px}
  .lp-lead {font-size: clamp(32px, 3.4vw, 50px)}
  .lp-path {margin: 0}
  .login-pane {padding-top: 28px; padding-bottom: 18px}
  .login-card {padding: 28px 32px 24px}
  .login-form {gap: 14px; margin-top: 20px}
  .login-note {margin-top: 16px; padding-top: 14px}
  .login-legal {margin-top: 14px}
}
@media (max-width: 980px) {
  .auth-login {grid-template-columns: 1fr; grid-template-rows: auto 1fr}
  .login-brand-panel {gap: 16px; padding: 22px 28px 24px}
  .lp-body {max-width: 640px; margin: 0; gap: 14px}
  .lp-lead {font-size: clamp(26px, 4vw, 32px)}
  .lp-sub {font-size: 13.5px; line-height: 1.75}
  .lp-path {max-width: 520px; margin: 2px 0 0}
  .lp-steps {margin-top: 8px; font-size: 12px}
  .lp-foot {display: none}
  .login-pane {grid-template-rows: auto 1fr; place-items: start center; padding: 26px 24px 16px}
  .login-card {width: min(460px, 100%)}
  .login-legal {align-self: end; margin-top: 16px}
}
@media (max-width: 640px) {
  .login-brand-panel {gap: 14px; padding: 18px 20px 20px}
  .brand-mark {width: 30px; height: 30px; font-size: 15px}
  .brand-name b {font-size: 16px}
  .lp-lead {font-size: 22px; line-height: 1.35}
  .lp-lead br {display: none}
  .lp-sub, .lp-path {display: none}
  .login-pane {padding: 22px 18px 16px}
  .login-card {padding: 24px 20px 22px; border-radius: 10px}
  .login-eyebrow {letter-spacing: .06em}
  .login-card h1 {margin-top: 10px; font-size: 26px}
}
</style>
