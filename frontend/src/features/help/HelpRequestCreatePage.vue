<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { assignmentsApi, tutoringApi } from '../../api'
import { ApiError } from '../../api/client'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'
import { isUuid } from '../assignments/format'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const assignmentId = computed(() => {
  const value = route.params.id
  return typeof value === 'string' && isUuid(value) ? value : null
})

const assignments = assignmentsApi()
const assignmentQuery = usePageQuery(async signal => {
  if (assignmentId.value === null) throw new Error('作业地址不正确')
  return (await assignments.getAssignment(assignmentId.value, { signal })).data
})
const assignment = computed(() => assignmentQuery.data.value)
const offeringId = computed(() => assignment.value?.offeringId ?? null)

const tagsQuery = usePageQuery(async signal => {
  if (offeringId.value === null) throw new Error('尚未读取到课程')
  return (await tutoringApi().getIssueTags(offeringId.value, { signal })).data
})

/** 可共享的 AI 片段：本人本作业各会话中已交付的助手回复。 */
interface ShareOption { requestId: string; preview: string }
const shareOptions = shallowRef<ShareOption[]>([])
const shareQuery = usePageQuery(async signal => {
  if (assignmentId.value === null) throw new Error('作业地址不正确')
  const sessions = (await tutoringApi().listTutoringSessions(assignmentId.value, { pageSize: 20 }, { signal })).data
  const options: ShareOption[] = []
  for (const session of sessions.items) {
    const messages = (await tutoringApi().listTutoringMessages(session.id, { pageSize: 50 }, { signal })).data
    for (const message of messages.items) {
      if (message.role === 'assistant' && message.content !== null) {
        options.push({ requestId: message.tutoringRequestId, preview: message.content.slice(0, 60) })
      }
    }
  }
  const seen = new Set<string>()
  return options.filter(option => seen.has(option.requestId) ? false : seen.add(option.requestId))
})
watch(() => shareQuery.data.value, options => { shareOptions.value = options ?? [] })

const workspaceQuery = usePageQuery(async signal => {
  if (assignmentId.value === null) throw new Error('作业地址不正确')
  return (await assignments.getWorkspace(assignmentId.value, { signal })).data
})

const title = ref('')
const content = ref('')
const attempt = ref('')
const selectedTags = ref<string[]>([])
const sharedRequests = ref<string[]>([])
const shareWorkspace = ref(false)
const submitting = ref(false)
const formError = ref('')

watch(assignmentId, () => {
  if (assignmentId.value !== null) {
    void assignmentQuery.load()
    void shareQuery.load()
    void workspaceQuery.load()
  }
}, { immediate: true })
watch(offeringId, () => { if (offeringId.value !== null) void tagsQuery.load() })

function toggle(list: string[], value: string): void {
  const index = list.indexOf(value)
  if (index >= 0) list.splice(index, 1)
  else list.push(value)
}

async function submit(): Promise<void> {
  if (assignmentId.value === null || submitting.value) return
  if (title.value.trim() === '' || content.value.trim() === '' || attempt.value.trim() === '') {
    formError.value = '标题、问题描述与实际尝试都是必填项。'
    return
  }
  submitting.value = true
  formError.value = ''
  const userId = auth.identity?.id
  try {
    const token = await auth.ensureCsrfToken()
    const result = await tutoringApi().createHelpRequest({
      assignmentId: assignmentId.value,
      title: title.value.trim(),
      content: content.value.trim(),
      studentAttempt: attempt.value.trim(),
      workspaceRevision: shareWorkspace.value && workspaceQuery.data.value !== null ? workspaceQuery.data.value.revision : null,
      sharedTutoringRequestIds: [...sharedRequests.value],
      issueTags: [...selectedTags.value],
    }, { csrfToken: token })
    if (auth.identity?.id !== userId) return
    auth.markActionSucceeded()
    await router.push({ name: 'student-help-request', params: { id: result.data.id } })
  } catch (cause) {
    formError.value = cause instanceof ApiError ? cause.message : '提交失败，请重试。'
  } finally {
    if (auth.identity?.id === userId) submitting.value = false
  }
}
</script>

<template>
  <div class="workspace-page help-create-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">向教师求助</h1>
        <p>{{ assignment?.title ?? '正在读取作业…' }}</p>
      </div>
      <div class="workspace-heading-actions">
        <RouterLink class="button secondary" :to="assignmentId !== null ? { name: 'student-assignment', params: { id: assignmentId } } : { name: 'student-assignments' }">← 返回作业详情</RouterLink>
      </div>
    </header>

    <p v-if="assignmentId === null" class="notice notice-warn" role="alert">作业地址不正确，请从作业列表重新进入。</p>
    <template v-else>
      <ApiState :status="assignmentQuery.status.value" :error="assignmentQuery.error.value" @retry="assignmentQuery.load" />

      <form v-if="assignmentQuery.status.value === 'success'" class="surface help-form" @submit.prevent="submit">
        <label class="help-field">
          <span>标题</span>
          <input v-model="title" maxlength="200" required placeholder="一句话说明问题" />
        </label>
        <label class="help-field">
          <span>问题描述</span>
          <textarea v-model="content" rows="4" maxlength="8000" required placeholder="现象、期望与疑问" />
        </label>
        <label class="help-field">
          <span>实际尝试（必填）</span>
          <textarea v-model="attempt" rows="3" maxlength="8000" required placeholder="已经做过什么、结果如何" />
        </label>

        <fieldset v-if="tagsQuery.status.value === 'success' && tagsQuery.data.value" class="help-field">
          <legend>问题标签（可选，帮助教师归类共性问题）</legend>
          <div class="help-tags">
            <label v-for="tag in tagsQuery.data.value.items" :key="tag.tag" class="help-tag" :aria-pressed="selectedTags.includes(tag.tag)">
              <input type="checkbox" :value="tag.tag" :checked="selectedTags.includes(tag.tag)" @change="toggle(selectedTags, tag.tag)" />
              <span :title="tag.description">{{ tag.title }}</span>
            </label>
          </div>
        </fieldset>

        <fieldset class="help-field">
          <legend>共享材料（可选，教师只能看到这里勾选的内容）</legend>
          <label class="help-check">
            <input v-model="shareWorkspace" type="checkbox" :disabled="workspaceQuery.data.value === null" />
            <span>当前工作区代码（版本 {{ workspaceQuery.data.value?.revision ?? '—' }}）</span>
          </label>
          <div v-if="shareOptions.length > 0" class="help-shares">
            <label v-for="option in shareOptions" :key="option.requestId" class="help-check">
              <input type="checkbox" :value="option.requestId" :checked="sharedRequests.includes(option.requestId)" @change="toggle(sharedRequests, option.requestId)" />
              <span>AI 对话片段：{{ option.preview }}…</span>
            </label>
          </div>
          <p v-else class="muted">本作业还没有可共享的 AI 回复。</p>
        </fieldset>

        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
        <button type="submit" class="button primary" :disabled="submitting">{{ submitting ? '正在提交…' : '提交求助' }}</button>
      </form>
    </template>
  </div>
</template>

<style scoped>
.help-form { display: grid; gap: 18px; max-width: 760px; }
.help-field { display: grid; gap: 8px; font-size: 14px; border: 0; padding: 0; margin: 0; min-width: 0; }
.help-field > span, .help-field legend { color: var(--ink); font-weight: 600; }
.help-field input[type='text'], .help-field input:not([type]), .help-field textarea { border: 1px solid var(--line-control); border-radius: var(--radius-control); min-height: 44px; padding: 8px 12px; font: inherit; background: var(--surface); color: var(--ink); }
.help-field textarea { resize: vertical; }
.help-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.help-tag { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-control); font-size: 13px; cursor: pointer; }
.help-tag:has(input:checked) { border-color: var(--blue); background: var(--blue-soft); color: var(--blue-text); }
.help-tag input { accent-color: var(--blue); margin: 0; }
.help-check { display: flex; align-items: flex-start; gap: 8px; min-height: 32px; font-size: 14px; }
.help-check input { accent-color: var(--blue); margin-top: 3px; }
.help-shares { display: grid; gap: 6px; margin-top: 8px; }
.help-form .button { justify-self: start; }
</style>
