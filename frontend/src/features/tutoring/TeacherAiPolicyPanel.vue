<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { tutoringApi } from '../../api'
import type { AiPolicyDTO } from '../../api/tutoring'
import { ApiError } from '../../api/client'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'

const props = defineProps<{ assignmentId: string }>()
const auth = useAuthStore()

const query = usePageQuery(async signal => (await tutoringApi().getTeacherAiPolicy(props.assignmentId, { signal })).data)
const policy = computed(() => query.data.value)
watch(() => props.assignmentId, () => { void query.load().then(() => syncForm()) }, { immediate: true })

const ACTION_LABELS = { ask: '继续追问', concept: '解释概念', next_hint: '下一层提示' } as const
const MODE_LABELS = { concept: '概念解释', debug_hint: '排错提示', guided_question: '引导提问' } as const
type Action = keyof typeof ACTION_LABELS
type Mode = keyof typeof MODE_LABELS

const form = reactive({
  enabled: true,
  allowedActions: [] as Action[],
  allowedModes: [] as Mode[],
  maxHintLevel: 3,
  requireAttemptFromLevel: 2,
  dailyAssignmentLimit: 12,
  maxOutputTokens: 800,
})

function syncForm(): void {
  const current = policy.value
  if (current === null) return
  form.enabled = current.enabled
  form.allowedActions = [...current.allowedActions] as Action[]
  form.allowedModes = [...current.allowedModes] as Mode[]
  form.maxHintLevel = current.maxHintLevel
  form.requireAttemptFromLevel = current.requireAttemptFromLevel
  form.dailyAssignmentLimit = current.dailyAssignmentLimit
  form.maxOutputTokens = current.maxOutputTokens
  formError.value = ''
  conflict.value = false
}

function toggle<Key extends string>(list: Key[], value: Key): void {
  const index = list.indexOf(value)
  if (index >= 0) list.splice(index, 1)
  else list.push(value)
}

const saving = ref(false)
const formError = ref('')
const conflict = ref(false)
const savedVersion = ref<number | null>(null)
let generation = 0

async function save(): Promise<void> {
  if (policy.value === null || saving.value) return
  if (form.enabled && (form.allowedActions.length === 0 || form.allowedModes.length === 0)) {
    formError.value = '启用 AI 辅导时至少保留一种提问动作与一种回复模式。'
    return
  }
  const current = ++generation, userId = auth.identity?.id
  saving.value = true
  formError.value = ''
  conflict.value = false
  try {
    const token = await auth.ensureCsrfToken()
    const result = await tutoringApi().updateAiPolicy(props.assignmentId, {
      baseVersion: policy.value.version,
      enabled: form.enabled,
      allowedActions: [...form.allowedActions],
      allowedModes: [...form.allowedModes],
      restrictCompleteSolution: true,
      allowCodeBlocks: false,
      maxHintLevel: form.maxHintLevel,
      requireAttemptFromLevel: form.requireAttemptFromLevel,
      dailyAssignmentLimit: form.dailyAssignmentLimit,
      maxOutputTokens: form.maxOutputTokens,
    }, { csrfToken: token })
    if (current !== generation || auth.identity?.id !== userId) return
    auth.markActionSucceeded()
    savedVersion.value = result.data.version
    await query.load()
    syncForm()
  } catch (cause) {
    if (current !== generation || auth.identity?.id !== userId) return
    if (cause instanceof ApiError && cause.code === 'AI_POLICY_VERSION_CONFLICT') {
      conflict.value = true
      formError.value = '政策刚被其他入口更新，已为你重新读取最新版本，请确认后再保存。'
      await query.load()
      syncForm()
      conflict.value = true
      return
    }
    formError.value = cause instanceof ApiError ? cause.message : '保存失败，请重试。'
  } finally {
    if (current === generation) saving.value = false
  }
}
</script>

<template>
  <section class="surface ai-policy-panel" aria-labelledby="ai-policy-title">
    <header class="section-heading">
      <h2 id="ai-policy-title">AI 辅导政策</h2>
      <span v-if="policy" class="tag">{{ policy.enabled ? '已启用 · 版本 ' + policy.version : '未启用 · 版本 ' + policy.version }}</span>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <template v-if="query.status.value === 'success' && policy">
      <blockquote class="ai-policy-boundary">{{ policy.boundaryText }}</blockquote>

      <form class="ai-policy-form" @submit.prevent="save">
        <label class="ai-policy-check">
          <input v-model="form.enabled" type="checkbox" />
          <span>对本作业启用 AI 辅导（关闭后学生只能求助教师）</span>
        </label>

        <fieldset class="ai-policy-field" :disabled="!form.enabled">
          <legend>允许学生的提问动作</legend>
          <div class="ai-policy-options">
            <label v-for="(label, key) in ACTION_LABELS" :key="key" class="ai-policy-option" :aria-pressed="form.allowedActions.includes(key)">
              <input type="checkbox" :value="key" :checked="form.allowedActions.includes(key)" @change="toggle(form.allowedActions, key)" />
              <span>{{ label }}</span>
            </label>
          </div>
        </fieldset>

        <fieldset class="ai-policy-field" :disabled="!form.enabled">
          <legend>允许的回复模式</legend>
          <div class="ai-policy-options">
            <label v-for="(label, key) in MODE_LABELS" :key="key" class="ai-policy-option" :aria-pressed="form.allowedModes.includes(key)">
              <input type="checkbox" :value="key" :checked="form.allowedModes.includes(key)" @change="toggle(form.allowedModes, key)" />
              <span>{{ label }}</span>
            </label>
          </div>
        </fieldset>

        <div class="ai-policy-grid">
          <label class="ai-policy-field">
            <span>最高提示层次（1–3）</span>
            <select v-model.number="form.maxHintLevel" :disabled="!form.enabled">
              <option :value="1">1 层</option>
              <option :value="2">2 层</option>
              <option :value="3">3 层</option>
            </select>
          </label>
          <label class="ai-policy-field">
            <span>从第几层起要求描述尝试</span>
            <select v-model.number="form.requireAttemptFromLevel" :disabled="!form.enabled">
              <option :value="1">第 1 层起</option>
              <option :value="2">第 2 层起</option>
            </select>
          </label>
          <label class="ai-policy-field">
            <span>本作业每人每日上限（≤12）</span>
            <input v-model.number="form.dailyAssignmentLimit" type="number" min="1" max="12" step="1" :disabled="!form.enabled" />
          </label>
          <label class="ai-policy-field">
            <span>单次回复上限 token（≤800）</span>
            <input v-model.number="form.maxOutputTokens" type="number" min="1" max="800" step="1" :disabled="!form.enabled" />
          </label>
        </div>

        <p class="muted ai-policy-fixed">
          平台固定项：禁止生成完整实现、禁止代码块；每人每日 30 次、每分钟 3 次为平台级配置，教师不可调整。
        </p>

        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
        <p v-if="savedVersion !== null && !formError" class="notice notice-info" role="status">已保存为版本 {{ savedVersion }}，学生侧立即生效。</p>

        <button type="submit" class="button primary" :disabled="saving || query.status.value !== 'success'">
          {{ saving ? '正在保存…' : '保存政策' }}
        </button>
        <button v-if="conflict" type="button" class="button secondary" @click="conflict = false">继续编辑</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.ai-policy-panel { margin-top: 20px; }
.ai-policy-boundary { margin: 0 0 16px; padding: 10px 14px; border-left: 3px solid var(--blue); background: var(--blue-soft); border-radius: 0 var(--radius-control) var(--radius-control) 0; font-size: 13px; color: var(--ink); }
.ai-policy-form { display: grid; gap: 16px; }
.ai-policy-check { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 14px; }
.ai-policy-check input { accent-color: var(--blue); }
.ai-policy-field { display: grid; gap: 8px; border: 0; padding: 0; margin: 0; font-size: 14px; min-width: 0; }
.ai-policy-field legend, .ai-policy-field > span { font-weight: 600; color: var(--ink); }
.ai-policy-options { display: flex; flex-wrap: wrap; gap: 8px; }
.ai-policy-option { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-control); font-size: 13px; cursor: pointer; }
.ai-policy-option:has(input:checked) { border-color: var(--blue); background: var(--blue-soft); color: var(--blue-text); }
.ai-policy-option input { margin: 0; accent-color: var(--blue); }
.ai-policy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.ai-policy-field select, .ai-policy-field input[type='number'] { min-height: 44px; padding: 8px 12px; border: 1px solid #8993a0; border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit; font-size: 14px; }
.ai-policy-fixed { margin: 0; font-size: 13px; }
.ai-policy-form .button { justify-self: start; }
.ai-policy-form .button + .button { margin-left: 8px; }
</style>
