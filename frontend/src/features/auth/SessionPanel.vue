<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { components } from '../../api/generated/schema'
import { useAuthStore } from '../../stores/auth'

type Role = components['schemas']['Role']

const ROLE_LABELS: Record<Role, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
}

const auth = useAuthStore()
const router = useRouter()
const loggingOut = ref(false)
const logoutFailed = ref(false)

const identity = computed(() => auth.identity)
const config = computed(() => auth.config)
const unknownRoles = computed(
  () => identity.value?.roles.filter((role) => !(role in ROLE_LABELS)) ?? [],
)
const roleLabels = computed(
  () =>
    identity.value?.roles.map((role) => {
      const label = ROLE_LABELS[role as Role]
      return label === undefined ? `未知角色（${role}）` : label
    }) ?? [],
)

function formatBeijingTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

const serverTimeLabel = computed(() =>
  config.value === null ? '—' : formatBeijingTime(config.value.serverTime),
)

const currentTermLabel = computed(() => {
  const cfg = config.value
  if (cfg === null) return '—'
  if (cfg.currentTermId === null) return '未设置'
  const term = cfg.terms.find((item) => item.id === cfg.currentTermId)
  return term === undefined ? '已设置' : term.label
})

const features = computed(() => {
  if (config.value === null) {
    return [
      { label: 'AI 辅导', enabled: false },
      { label: '学习分析', enabled: false },
      { label: '运行检查', enabled: false },
    ]
  }
  return [
    { label: 'AI 辅导', enabled: config.value.features.aiTutoring },
    { label: '学习分析', enabled: config.value.features.learningAnalytics },
    { label: '运行检查', enabled: config.value.features.serverChecks },
  ]
})

async function logout(): Promise<void> {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutFailed.value = false
  const ok = await auth.logout()
  loggingOut.value = false
  if (ok) {
    await router.push({ name: 'login' })
  } else {
    logoutFailed.value = true
  }
}
</script>

<template>
  <section class="session-panel" aria-labelledby="session-title">
    <h1 id="session-title" tabindex="-1">学习空间</h1>
    <p class="session-note">
      P0-A 会话联调页：验证登录、身份恢复与退出链路。正式首页与业务页面随 P1 工作包交付。
    </p>

    <div v-if="auth.bootStatus === 'error'" class="notice notice-error" role="alert">
      <p>无法连接服务，请确认后端是否已启动。</p>
      <button type="button" class="button secondary" @click="auth.retryBoot()">重试连接</button>
    </div>

    <div class="session-grid">
      <section class="panel" aria-labelledby="identity-title">
        <h2 id="identity-title">当前身份</h2>
        <template v-if="identity !== null">
          <dl class="session-list">
            <div><dt>姓名</dt><dd>{{ identity.displayName }}</dd></div>
            <div><dt>用户名</dt><dd class="mono">{{ identity.username }}</dd></div>
            <div><dt>角色</dt><dd>{{ roleLabels.join('、') }}</dd></div>
          </dl>
          <p
            v-if="unknownRoles.length > 0"
            class="notice notice-error"
            role="alert"
          >
            接口返回了未知的角色值（{{ unknownRoles.join('、') }}），页面无法安全显示；
            requestId: {{ auth.identityRequestId ?? '（未记录）' }}
          </p>
        </template>
        <p v-else class="session-empty">尚未取得身份信息。</p>
        <div class="session-actions">
          <button type="button" class="button secondary" :disabled="loggingOut" @click="logout">
            {{ loggingOut ? '退出中…' : '退出登录' }}
          </button>
          <p v-if="logoutFailed" class="field-error" role="alert">退出失败，请重试。</p>
        </div>
      </section>

      <section class="panel" aria-labelledby="config-title">
        <h2 id="config-title">服务配置</h2>
        <template v-if="config !== null">
          <dl class="session-list">
            <div><dt>服务器时间</dt><dd>{{ serverTimeLabel }}（北京时间）</dd></div>
            <div><dt>时区</dt><dd class="mono">{{ config.timezone }}</dd></div>
            <div><dt>当前学期</dt><dd>{{ currentTermLabel }}</dd></div>
          </dl>
          <h3>功能开关</h3>
          <ul class="feature-list">
            <li v-for="feature in features" :key="feature.label">
              <span>{{ feature.label }}</span>
              <span class="tag" :class="feature.enabled ? 'tag-on' : 'tag-off'">
                {{ feature.enabled ? '已开放' : '未开放' }}
              </span>
            </li>
          </ul>
        </template>
        <p v-else class="session-empty">配置暂不可用（{{ auth.config === null ? '未读取或读取失败' : '' }}）。</p>
      </section>
    </div>
  </section>
</template>
