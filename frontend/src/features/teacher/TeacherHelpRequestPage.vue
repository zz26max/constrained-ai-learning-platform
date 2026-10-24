<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { tutoringApi } from '../../api'
import { ApiError } from '../../api/client'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'
import { formatTime } from '../courses/format'
import { isUuid } from '../assignments/format'

const route = useRoute()
const auth = useAuthStore()
const helpRequestId = computed(() => {
  const value = route.params.id
  return typeof value === 'string' && isUuid(value) ? value : null
})

const query = usePageQuery(async signal => {
  if (helpRequestId.value === null) throw new Error('求助地址不正确')
  return (await tutoringApi().getTeacherHelpRequest(helpRequestId.value, { signal })).data
})
watch(helpRequestId, () => { void query.load() }, { immediate: true })
const detail = computed(() => query.data.value)

const tagsQuery = usePageQuery(async signal => {
  if (detail.value === null) throw new Error('尚未读取到求助')
  return (await tutoringApi().getIssueTags(detail.value.offeringId, { signal })).data
})
watch(() => detail.value?.offeringId, () => { if (detail.value !== null) void tagsQuery.load() })
function tagTitle(tag: string): string {
  return tagsQuery.data.value?.items.find(item => item.tag === tag)?.title ?? tag
}

const STATUS_LABELS = { open: '待处理', answered: '已回复', closed: '已关闭' } as const

const replyContent = ref('')
const replying = ref(false)
const closing = ref(false)
const confirmingClose = ref(false)
const actionError = ref('')
let generation = 0

async function reply(): Promise<void> {
  if (helpRequestId.value === null || replying.value) return
  if (replyContent.value.trim() === '') {
    actionError.value = '回复内容不能为空。'
    return
  }
  const current = ++generation, userId = auth.identity?.id
  replying.value = true
  actionError.value = ''
  try {
    const token = await auth.ensureCsrfToken()
    await tutoringApi().replyToHelpRequest(helpRequestId.value, { content: replyContent.value.trim() }, { csrfToken: token })
    if (current !== generation || auth.identity?.id !== userId) return
    auth.markActionSucceeded()
    replyContent.value = ''
    confirmingClose.value = false
    await query.load()
  } catch (cause) {
    if (current !== generation || auth.identity?.id !== userId) return
    actionError.value = cause instanceof ApiError ? cause.message : '回复失败，请重试。'
  } finally {
    if (current === generation) replying.value = false
  }
}

async function close(): Promise<void> {
  if (helpRequestId.value === null || closing.value) return
  const current = ++generation, userId = auth.identity?.id
  closing.value = true
  actionError.value = ''
  try {
    const token = await auth.ensureCsrfToken()
    await tutoringApi().closeHelpRequest(helpRequestId.value, { status: 'closed' }, { csrfToken: token })
    if (current !== generation || auth.identity?.id !== userId) return
    auth.markActionSucceeded()
    confirmingClose.value = false
    await query.load()
  } catch (cause) {
    if (current !== generation || auth.identity?.id !== userId) return
    actionError.value = cause instanceof ApiError ? cause.message : '关闭失败，请重试。'
  } finally {
    if (current === generation) closing.value = false
  }
}
</script>

<template>
  <div class="workspace-page teacher-page teacher-help-detail">
    <RouterLink class="teacher-back" :to="{ name: 'teacher-offering', params: { id: detail?.offeringId ?? '' } }">返回教学班工作台</RouterLink>
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">{{ detail?.title ?? '求助处理' }}</h1>
        <p v-if="detail">
          <span class="tag" :class="detail.status === 'open' ? 'tag-open' : detail.status === 'answered' ? 'tag-on' : 'tag-off'">{{ STATUS_LABELS[detail.status] }}</span>
          {{ detail.student.displayName }}（{{ detail.student.username }}）· {{ formatTime(detail.createdAt) }} 提交
        </p>
      </div>
      <button
        v-if="detail && detail.status !== 'closed'"
        type="button"
        class="button secondary"
        @click="confirmingClose = true"
      >
        关闭求助
      </button>
    </header>

    <p v-if="helpRequestId === null" class="notice notice-warn" role="alert">求助地址不正确，请从教学班工作台的求助列表重新进入。</p>
    <template v-else>
      <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

      <p v-if="confirmingClose && detail" class="notice notice-warn" role="alert">
        关闭后学生不能再就本条求助追问，历史内容保留。确定关闭？
        <button type="button" class="button secondary" :disabled="closing" @click="confirmingClose = false">取消</button>
        <button type="button" class="button primary" :disabled="closing" @click="close">{{ closing ? '正在关闭…' : '确认关闭' }}</button>
      </p>

      <template v-if="query.status.value === 'success' && detail">
        <section class="surface help-block" aria-labelledby="teacher-help-content">
          <h2 id="teacher-help-content">问题描述</h2>
          <p class="help-text">{{ detail.content }}</p>
          <h3>学生实际尝试</h3>
          <p class="help-text">{{ detail.studentAttempt }}</p>
          <p v-if="detail.issueTags.length > 0" class="help-tags">
            <span v-for="tag in detail.issueTags" :key="tag" class="tag">{{ tagTitle(tag) }}</span>
          </p>
        </section>

        <section v-if="detail.sharedSnapshot !== null || detail.sharedTutoringResults.length > 0" class="surface help-block" aria-labelledby="teacher-help-shared">
          <h2 id="teacher-help-shared">学生共享的材料</h2>
          <template v-if="detail.sharedSnapshot !== null">
            <h3>工作区代码（版本 {{ detail.workspaceRevision }}）</h3>
            <details v-for="file in detail.sharedSnapshot.files" :key="file.path" class="help-file">
              <summary>{{ file.path }}</summary>
              <pre>{{ file.content }}</pre>
            </details>
          </template>
          <template v-if="detail.sharedTutoringResults.length > 0">
            <h3>AI 对话片段（学生主动共享）</h3>
            <blockquote v-for="shared in detail.sharedTutoringResults" :key="shared.requestId" class="help-quote">
              <p v-if="shared.content !== null">{{ shared.content }}</p>
              <p v-else class="teacher-muted">该片段已过保留期限。</p>
            </blockquote>
          </template>
        </section>

        <section class="surface help-block" aria-labelledby="teacher-help-replies">
          <h2 id="teacher-help-replies">回复记录</h2>
          <p v-if="detail.replies.length === 0" class="teacher-muted">尚未回复。</p>
          <ul v-else class="help-replies">
            <li v-for="item in detail.replies" :key="item.id">
              <p class="help-reply-meta"><strong>{{ item.teacher.displayName }}</strong> · {{ formatTime(item.createdAt) }}</p>
              <p class="help-text">{{ item.content }}</p>
            </li>
          </ul>

          <form v-if="detail.status !== 'closed'" class="help-reply-form" @submit.prevent="reply">
            <label for="help-reply-content">回复学生</label>
            <textarea id="help-reply-content" v-model="replyContent" rows="3" maxlength="8000" :disabled="replying" placeholder="指出方向或给出修正建议；回复后学生会收到消息提醒" />
            <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
            <button type="submit" class="button primary" :disabled="replying">{{ replying ? '正在回复…' : '发布回复' }}</button>
          </form>
          <p v-else class="teacher-muted">求助已关闭，不再接受回复。</p>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.help-block { padding: 22px 26px; margin-bottom: 20px; }
.help-block h2 { font-size: 18px; margin: 0 0 12px; }
.help-block h3 { font-size: 15px; margin: 16px 0 8px; }
.help-text { margin: 0; font-size: 14px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
.help-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 0; }
.help-file { border: 1px solid var(--line); border-radius: var(--radius-control); margin-bottom: 8px; }
.help-file summary { min-height: 44px; display: flex; align-items: center; padding: 0 14px; cursor: pointer; font-family: Consolas, monospace; font-size: 13px; color: var(--blue-text); }
.help-file pre { margin: 0; padding: 12px 14px; border-top: 1px solid var(--line); background: var(--canvas); font: 13px/1.8 Consolas, 'Microsoft YaHei', monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; }
.help-quote { margin: 0 0 10px; padding: 10px 14px; border-left: 3px solid var(--blue); background: var(--blue-soft); border-radius: 0 var(--radius-control) var(--radius-control) 0; }
.help-quote p { margin: 0; font-size: 14px; line-height: 1.7; }
.help-replies { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.help-reply-meta { margin: 0 0 4px; font-size: 13px; color: var(--muted); }
.help-reply-form { display: grid; gap: 10px; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); max-width: 720px; }
.help-reply-form label { font-size: 14px; font-weight: 600; }
.help-reply-form textarea { border: 1px solid #8993a0; border-radius: var(--radius-control); padding: 9px 12px; font: inherit; font-size: 14px; background: var(--surface); color: var(--ink); resize: vertical; }
.help-reply-form .button { justify-self: start; }
.tag-open { background: var(--orange-soft); color: var(--orange); }
</style>
