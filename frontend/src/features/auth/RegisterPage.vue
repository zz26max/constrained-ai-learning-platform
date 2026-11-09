<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isInternalPath } from '../../app/router'
import { useAuthStore, type RegisterFailure } from '../../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

type RegisterStep = 'basic' | 'mode' | 'personal-confirm' | 'school-role' | 'school-student' | 'school-teacher'

const step = ref<RegisterStep>('basic')
const mode = ref<'personal' | 'school'>('personal')
const role = ref<'student' | 'teacher'>('student')

const username = ref('')
const displayName = ref('')
const password = ref('')
const confirmPassword = ref('')
const inviteCode = ref('')
const createClass = ref(true)
const showPassword = ref(false)
const basicErrors = ref<string[]>([])

const submitting = computed(() => auth.registerStatus === 'loading')
const failure = computed<RegisterFailure | null>(() => auth.registerFailure)

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
  if (failure.value.kind === 'username-taken' || failure.value.kind === 'invalid-invite' || failure.value.kind === 'unavailable') {
    return 'notice-error'
  }
  return 'notice-warn'
})

const stepNumber = computed(() => step.value === 'basic' ? 1 : step.value === 'mode' ? 2 : step.value === 'personal-confirm' || step.value === 'school-role' ? 3 : 4)
const totalSteps = computed(() => mode.value === 'personal' ? 3 : 4)

const stepTitle = computed(() => {
  switch (step.value) {
    case 'basic': return '创建账号'
    case 'mode': return '选择学习模式'
    case 'personal-confirm': return '个人自学模式'
    case 'school-role': return '学校模式 - 选择角色'
    case 'school-student': return '学校模式 - 学生注册'
    case 'school-teacher': return '学校模式 - 教师注册'
  }
})

const brandFoot = computed(() => {
  return mode.value === 'personal' ? '个人自学 · 随时注册开始' : '学校课程 · 邀请码加入班级'
})

function validateBasic(): boolean {
  const errors: string[] = []
  if (username.value.length < 3 || username.value.length > 32) {
    errors.push('用户名须为 3-32 字符')
  }
  if (!/^[a-z0-9._-]+$/.test(username.value)) {
    errors.push('用户名只能包含小写字母、数字、点、下划线和连字符')
  }
  if (!displayName.value.trim() || displayName.value.length > 50) {
    errors.push('显示名称须为 1-50 字符')
  }
  if (password.value.length < 8 || password.value.length > 64) {
    errors.push('密码须为 8-64 字符')
  }
  if (!/[A-Z]/.test(password.value) || !/[a-z]/.test(password.value) || !/[0-9]/.test(password.value)) {
    errors.push('密码须包含大写、小写字母和数字')
  }
  if (password.value !== confirmPassword.value) {
    errors.push('两次输入的密码不一致')
  }
  basicErrors.value = errors
  return errors.length === 0
}

function nextStep(): void {
  if (step.value === 'basic') {
    if (!validateBasic()) return
    step.value = 'mode'
  } else if (step.value === 'mode') {
    if (mode.value === 'personal') {
      step.value = 'personal-confirm'
    } else {
      step.value = 'school-role'
    }
  } else if (step.value === 'school-role') {
    if (role.value === 'student') {
      step.value = 'school-student'
    } else {
      step.value = 'school-teacher'
    }
  }
}

function prevStep(): void {
  if (step.value === 'mode') {
    step.value = 'basic'
  } else if (step.value === 'personal-confirm' || step.value === 'school-role') {
    step.value = 'mode'
  } else if (step.value === 'school-student' || step.value === 'school-teacher') {
    step.value = 'school-role'
  }
}

function onEnter(event: KeyboardEvent): void {
  if (event.isComposing || !(event.target instanceof HTMLInputElement)) return
  event.preventDefault()
  void submit()
}

async function submit(): Promise<void> {
  if (submitting.value) return
  // Enter advances the current step; it must not bypass mode/role confirmation.
  if (step.value === 'basic' || step.value === 'mode' || step.value === 'school-role') {
    nextStep()
    return
  }
  if (!validateBasic()) {
    step.value = 'basic'
    await nextTick()
    document.getElementById('register-username')?.focus()
    return
  }
  
  const ok = await auth.register({
    username: username.value,
    password: password.value,
    displayName: displayName.value,
    mode: mode.value,
    role: mode.value === 'school' ? role.value : undefined,
    inviteCode: mode.value === 'school' && role.value === 'student' ? inviteCode.value : undefined,
    createClass: mode.value === 'school' && role.value === 'teacher' ? createClass.value : undefined,
  })
  
  if (!ok) {
    let focusId: string | undefined
    if (failure.value?.kind === 'username-taken') {
      step.value = 'basic'
      focusId = 'register-username'
    } else if (failure.value?.kind === 'invalid-invite') {
      step.value = 'school-student'
      focusId = 'register-invite-code'
    } else if (failure.value?.kind === 'validation') {
      const fields = fieldErrors.value.map(item => item.field)
      if (fields.some(field => ['username', 'password', 'displayName'].includes(field))) {
        step.value = 'basic'
        focusId = fields.includes('username') ? 'register-username' : fields.includes('password') ? 'register-password' : 'register-display-name'
      } else if (fields.includes('inviteCode')) {
        step.value = 'school-student'
        focusId = 'register-invite-code'
      }
    }
    if (focusId) {
      await nextTick()
      document.getElementById(focusId)?.focus()
    }
    return
  }
  
  const ret = route.query.return
  const target = typeof ret === 'string' && isInternalPath(ret) ? ret : '/'
  await router.push(target)
}
</script>

<template>
  <div class="auth-register">
    <aside class="register-brand-panel" aria-label="知学平台介绍">
      <div class="register-lock">
        <span class="brand-mark" aria-hidden="true">知</span>
        <span class="brand-name"><b>知学</b><small>学习平台</small></span>
      </div>
      <div class="rp-body">
        <template v-if="step === 'basic' || step === 'mode'">
          <p class="rp-lead">开始你的<br /><span>学习之旅。</span></p>
          <p class="rp-sub">选择适合你的学习模式，立即开始探索丰富的课程内容。</p>
          <div class="rp-features">
            <div class="rp-feature">
              <div class="rp-feature-icon">📚</div>
              <div class="rp-feature-text">
                <h4>个人自学</h4>
                <p>随时注册，立即开始学习默认课程</p>
              </div>
            </div>
            <div class="rp-feature">
              <div class="rp-feature-icon">🏫</div>
              <div class="rp-feature-text">
                <h4>学校课程</h4>
                <p>使用邀请码加入班级，跟随教师学习</p>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <p class="rp-lead">即将完成<br /><span>账号创建。</span></p>
          <p class="rp-sub">请确认以下信息，点击"完成注册"开始你的学习之旅。</p>
          <div class="rp-summary">
            <div class="rp-summary-item">
              <span class="rp-summary-label">用户名</span>
              <span class="rp-summary-value">{{ username }}</span>
            </div>
            <div class="rp-summary-item">
              <span class="rp-summary-label">学习模式</span>
              <span class="rp-summary-value">{{ mode === 'personal' ? '个人自学' : '学校课程' }}</span>
            </div>
            <div v-if="mode === 'school'" class="rp-summary-item">
              <span class="rp-summary-label">角色</span>
              <span class="rp-summary-value">{{ role === 'student' ? '学生' : '教师' }}</span>
            </div>
          </div>
        </template>
      </div>
      <p class="rp-foot">{{ brandFoot }}</p>
    </aside>

    <main class="register-pane">
      <section class="register-card" aria-labelledby="register-title">
        <p class="register-eyebrow">步骤 {{ stepNumber }} / {{ totalSteps }}</p>
        <h1 id="register-title" tabindex="-1">{{ stepTitle }}</h1>

        <form class="auth-form register-form" novalidate @submit.prevent="submit" @keydown.enter="onEnter">
          <p
            v-if="failure !== null && failure.kind !== 'validation'"
            class="notice notice-top"
            :class="failureNoticeClass"
            role="alert"
          >
            {{ failure.message }}
          </p>

          <p v-if="failure !== null && auth.lastRequestId !== null" class="request-id request-id-top">
            requestId: {{ auth.lastRequestId }}
          </p>

          <!-- Step 1: Basic Info -->
          <template v-if="step === 'basic'">
            <div v-if="basicErrors.length > 0" class="validation-errors" role="alert">
              <p v-for="(error, index) in basicErrors" :key="index" class="validation-error-item">
                {{ error }}
              </p>
            </div>

            <div class="form-field">
              <label for="register-username">用户名</label>
              <input
                id="register-username"
                v-model="username"
                name="username"
                type="text"
                autocomplete="username"
                placeholder="3-32 位字母、数字、点、下划线或连字符"
                :readonly="submitting"
                :aria-invalid="fieldMessages('username').length > 0 ? 'true' : undefined"
              />
              <p v-for="message in fieldMessages('username')" :key="message" class="field-error">
                {{ message }}
              </p>
            </div>

            <div class="form-field">
              <label for="register-display-name">显示名称</label>
              <input
                id="register-display-name"
                v-model="displayName"
                name="displayName"
                type="text"
                autocomplete="name"
                placeholder="1-50 字符"
                :readonly="submitting"
                :aria-invalid="fieldMessages('displayName').length > 0 ? 'true' : undefined"
              />
              <p v-for="message in fieldMessages('displayName')" :key="message" class="field-error">
                {{ message }}
              </p>
            </div>

            <div class="form-field">
              <label for="register-password">密码</label>
              <div class="password-control">
                <input
                  id="register-password"
                  v-model="password"
                  name="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="8-64 位，含大小写字母和数字"
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

            <div class="form-field">
              <label for="register-confirm-password">确认密码</label>
              <input
                id="register-confirm-password"
                v-model="confirmPassword"
                name="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="再次输入密码"
                :readonly="submitting"
              />
            </div>

            <button type="button" class="button primary register-submit" @click="nextStep">
              下一步
            </button>
          </template>

          <!-- Step 2: Mode Selection -->
          <template v-else-if="step === 'mode'">
            <div class="mode-selection">
              <button
                type="button"
                class="mode-option"
                :class="{ active: mode === 'personal' }"
                @click="mode = 'personal'"
              >
                <div class="mode-icon">📚</div>
                <h3>个人自学</h3>
                <p>注册后即可开始学习个人自学课程（含示例作业与 AI 辅导）</p>
              </button>
              <button
                type="button"
                class="mode-option"
                :class="{ active: mode === 'school' }"
                @click="mode = 'school'"
              >
                <div class="mode-icon">🏫</div>
                <h3>学校课程</h3>
                <p>使用邀请码加入班级或创建班级</p>
              </button>
            </div>

            <div class="button-group">
              <button type="button" class="button secondary" @click="prevStep">上一步</button>
              <button type="button" class="button primary" @click="nextStep">下一步</button>
            </div>
          </template>

          <!-- Step 3a: Personal Confirm -->
          <template v-else-if="step === 'personal-confirm'">
            <div class="confirm-box">
              <p class="confirm-text">你选择了<strong>个人自学模式</strong>。注册后将自动关联默认 Web 课程（含 5 章讲义与 2 份自带检查规则的示例作业），可以立即「读讲义 → 做作业 → 检查 → 问 AI」。</p>
            </div>

            <div class="button-group">
              <button type="button" class="button secondary" @click="prevStep">上一步</button>
              <button type="submit" class="button primary" :disabled="submitting" :aria-busy="submitting ? 'true' : undefined">
                {{ submitting ? '注册中…' : '完成注册' }}
              </button>
            </div>
          </template>

          <!-- Step 3b: School Role Selection -->
          <template v-else-if="step === 'school-role'">
            <div class="mode-selection">
              <button
                type="button"
                class="mode-option"
                :class="{ active: role === 'student' }"
                @click="role = 'student'"
              >
                <div class="mode-icon">🎓</div>
                <h3>我是学生</h3>
                <p>使用邀请码加入教师的课程班</p>
              </button>
              <button
                type="button"
                class="mode-option"
                :class="{ active: role === 'teacher' }"
                @click="role = 'teacher'"
              >
                <div class="mode-icon">👨‍🏫</div>
                <h3>我是教师</h3>
                <p>创建班级并生成邀请码给学生</p>
              </button>
            </div>

            <div class="button-group">
              <button type="button" class="button secondary" @click="prevStep">上一步</button>
              <button type="button" class="button primary" @click="nextStep">下一步</button>
            </div>
          </template>

          <!-- Step 4a: School Student -->
          <template v-else-if="step === 'school-student'">
            <div class="form-field">
              <label for="register-invite-code">邀请码</label>
              <input
                id="register-invite-code"
                v-model="inviteCode"
                name="inviteCode"
                type="text"
                placeholder="请输入教师提供的邀请码"
                :readonly="submitting"
                :aria-invalid="fieldMessages('inviteCode').length > 0 ? 'true' : undefined"
              />
              <p v-for="message in fieldMessages('inviteCode')" :key="message" class="field-error">
                {{ message }}
              </p>
              <p class="field-hint">邀请码由教师创建，用于加入课程班。</p>
            </div>

            <div class="button-group">
              <button type="button" class="button secondary" @click="prevStep">上一步</button>
              <button type="submit" class="button primary" :disabled="submitting" :aria-busy="submitting ? 'true' : undefined">
                {{ submitting ? '注册中…' : '完成注册' }}
              </button>
            </div>
          </template>

          <!-- Step 4b: School Teacher -->
          <template v-else-if="step === 'school-teacher'">
            <div class="form-field checkbox-field">
              <label class="checkbox-label">
                <input
                  v-model="createClass"
                  type="checkbox"
                  name="createClass"
                  :disabled="submitting"
                />
                <span>创建我的第一个班级</span>
              </label>
              <p class="field-hint">注册后可以立即创建一个班级，并生成邀请码给学生加入。</p>
            </div>

            <div class="button-group">
              <button type="button" class="button secondary" @click="prevStep">上一步</button>
              <button type="submit" class="button primary" :disabled="submitting" :aria-busy="submitting ? 'true' : undefined">
                {{ submitting ? '注册中…' : '完成注册' }}
              </button>
            </div>
          </template>
        </form>

        <p class="register-note">
          已有账号？<router-link :to="{ name: 'login' }">返回登录</router-link>
        </p>
      </section>
      <footer class="register-legal">© 2026 知学学习平台 · 仅限本校师生使用</footer>
    </main>
  </div>
</template>

<style scoped>
.auth-register {
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

.register-brand-panel {
  display: flex;
  flex-direction: column;
  gap: 30px;
  min-width: 0;
  padding: 42px 56px 24px;
  background: var(--ink);
  color: #fff;
}

.register-lock {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  background: #fff;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
}

.brand-name {
  display: grid;
  line-height: 1.25;
}

.brand-name b {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: .4px;
}

.brand-name small {
  font-size: 11.5px;
  color: #ffffff8f;
  letter-spacing: .3px;
}

.rp-body {
  display: grid;
  align-content: center;
  gap: 24px;
  max-width: 680px;
  margin: auto 0;
}

.rp-lead {
  margin: 0;
  font-size: clamp(38px, 3.7vw, 58px);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: .01em;
  animation: register-rise .5s cubic-bezier(.2, .7, .2, 1) .04s both;
}

.rp-lead span {
  color: #ffffff8f;
}

.rp-sub {
  max-width: 27em;
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  color: #ffffffa3;
  animation: register-rise .5s cubic-bezier(.2, .7, .2, 1) .12s both;
}

.rp-features {
  display: grid;
  gap: 16px;
  margin-top: 8px;
}

.rp-feature {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #ffffff0d;
  border-radius: 8px;
  animation: register-rise .5s cubic-bezier(.2, .7, .2, 1) .2s both;
}

.rp-feature-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.rp-feature-text h4 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
}

.rp-feature-text p {
  margin: 0;
  font-size: 13px;
  color: #ffffffa3;
  line-height: 1.6;
}

.rp-foot {
  margin: 0;
  font-size: 12px;
  color: #ffffff8c;
}

.rp-summary {
  display: grid;
  gap: 14px;
  margin-top: 8px;
  padding: 20px;
  background: #ffffff0d;
  border-radius: 8px;
  animation: register-rise .5s cubic-bezier(.2, .7, .2, 1) .2s both;
}

.rp-summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.rp-summary-label {
  font-size: 13px;
  color: #ffffffa3;
}

.rp-summary-value {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}

@keyframes register-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.register-pane {
  display: grid;
  grid-template-rows: 1fr auto;
  place-items: center;
  min-width: 0;
  padding: 40px 32px 24px;
}

.register-card {
  width: min(480px, 100%);
  padding: 34px 36px 30px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  animation: register-rise .55s cubic-bezier(.2, .7, .2, 1) .08s both;
}

.register-eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .1em;
  color: var(--blue);
}

.register-card h1 {
  margin: 12px 0 0;
  font-size: 28px;
  font-weight: 700;
  line-height: var(--lh-tight);
  letter-spacing: .5px;
}

.register-form {
  display: grid;
  gap: 16px;
  margin-top: 26px;
}

.form-field {
  display: grid;
  gap: 7px;
}

.form-field label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.form-field input[type="text"],
.form-field input[type="password"] {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--line-control);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 15px;
}

.form-field input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.form-field input[readonly] {
  background: #f7f9fc;
  color: var(--muted);
}

.form-field input[aria-invalid="true"] {
  border-color: var(--red);
  background: var(--red-soft);
}

.form-field input[aria-invalid="true"]:focus-visible {
  outline-color: var(--red);
}

.password-control {
  position: relative;
}

.password-control input {
  padding-right: 64px;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 3px;
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transform: translateY(-50%);
}

.password-toggle:hover {
  background: #f7f9fc;
  color: var(--ink);
}

.password-toggle:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.field-error {
  margin: 0;
  color: var(--red);
  font-size: 13px;
}

.field-hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.mode-selection {
  display: grid;
  gap: 12px;
  margin: 8px 0;
}

.mode-option {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  border: 2px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  font: inherit;
  color: var(--ink);
}

.mode-option:hover {
  border-color: var(--blue);
  background: #f7f9fc;
}

.mode-option.active {
  border-color: var(--blue);
  background: #eef3fc;
}

.mode-icon {
  font-size: 32px;
}

.mode-option h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.mode-option p {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

.confirm-box {
  padding: 16px;
  background: #f7f9fc;
  border-radius: 8px;
  margin: 8px 0;
}

.confirm-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
}

.confirm-text strong {
  color: var(--blue);
}

.checkbox-field {
  margin: 8px 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.button-group {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.button {
  flex: 1;
  min-height: 48px;
  padding: 0 20px;
  border: 0;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.button.primary {
  background: var(--blue);
  color: #fff;
}

.button.primary:hover:not(:disabled) {
  background: var(--blue-hover);
}

.button.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button.secondary {
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
}

.button.secondary:hover:not(:disabled) {
  background: #f7f9fc;
}

.register-submit {
  width: 100%;
}

.register-submit[aria-busy="true"] {
  opacity: 0.75;
  cursor: progress;
}

.notice[role="alert"] {
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.55;
}

.notice-error[role="alert"] {
  background: var(--red-soft);
  color: var(--red);
}

.notice-warn[role="alert"] {
  background: var(--orange-soft);
  color: var(--orange);
}

.notice-top {
  margin-bottom: 20px;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  text-align: center;
}

.request-id-top {
  margin-top: -12px;
  margin-bottom: 16px;
  text-align: center;
}

.validation-errors {
  margin-bottom: 20px;
  padding: 12px 16px;
  background: var(--red-soft);
  border-radius: 6px;
}

.validation-error-item {
  margin: 0;
  font-size: 14px;
  color: var(--red);
  line-height: 1.6;
}

.validation-error-item + .validation-error-item {
  margin-top: 4px;
}

.request-id {
  text-align: left;
  font-size: 12px;
  color: var(--muted);
}

.register-note {
  margin: 20px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 13px;
  line-height: 1.7;
  color: var(--muted);
  text-align: center;
}

.register-note a {
  color: var(--blue);
  text-decoration: none;
  font-weight: 600;
}

.register-note a:hover {
  text-decoration: underline;
}

.register-legal {
  margin-top: 20px;
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 1100px) and (min-width: 981px) {
  .register-brand-panel {
    padding: 32px 36px 20px;
  }
  .register-pane {
    padding: 32px 24px 20px;
  }
  .register-card {
    padding: 30px 30px 26px;
  }
}

@media (max-width: 980px) {
  .auth-register {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .register-brand-panel {
    gap: 16px;
    padding: 22px 28px 24px;
  }
  .rp-body {
    max-width: 640px;
    margin: 0;
    gap: 14px;
  }
  .rp-lead {
    font-size: clamp(26px, 4vw, 32px);
  }
  .rp-sub {
    font-size: 13.5px;
    line-height: 1.75;
  }
  .rp-foot {
    display: none;
  }
  .register-pane {
    grid-template-rows: auto 1fr;
    place-items: start center;
    padding: 26px 24px 16px;
  }
  .register-card {
    width: min(460px, 100%);
  }
  .register-legal {
    align-self: end;
    margin-top: 16px;
  }
}

@media (max-width: 640px) {
  .register-brand-panel {
    gap: 14px;
    padding: 18px 20px 20px;
  }
  .brand-mark {
    width: 30px;
    height: 30px;
    font-size: 15px;
  }
  .rp-lead {
    font-size: 22px;
    line-height: 1.35;
  }
  .rp-features {
    display: none;
  }
  .register-pane {
    padding: 22px 18px 16px;
  }
  .register-card {
    padding: 24px 20px 22px;
    border-radius: 10px;
  }
  .register-eyebrow {
    letter-spacing: .06em;
  }
  .register-card h1 {
    margin-top: 10px;
    font-size: 24px;
  }
  .button-group {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rp-lead,
  .rp-sub,
  .rp-feature,
  .register-card {
    animation: none;
  }
}
</style>
