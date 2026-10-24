<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { tutoringApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatTime } from '../courses/format'
import { isUuid } from '../assignments/format'

const route = useRoute()
const helpRequestId = computed(() => {
  const value = route.params.id
  return typeof value === 'string' && isUuid(value) ? value : null
})

const query = usePageQuery(async signal => {
  if (helpRequestId.value === null) throw new Error('求助地址不正确')
  return (await tutoringApi().getHelpRequest(helpRequestId.value, { signal })).data
})
watch(helpRequestId, () => { void query.load() }, { immediate: true })

const detail = computed(() => query.data.value)
const STATUS_LABELS = { open: '待处理', answered: '已回复', closed: '已关闭' } as const

const tagsQuery = usePageQuery(async signal => {
  if (detail.value === null) throw new Error('尚未读取到求助')
  return (await tutoringApi().getIssueTags(detail.value.offeringId, { signal })).data
})
watch(() => detail.value?.offeringId, () => { if (detail.value !== null) void tagsQuery.load() })

function tagTitle(tag: string): string {
  return tagsQuery.data.value?.items.find(item => item.tag === tag)?.title ?? tag
}
</script>

<template>
  <div class="workspace-page help-detail-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">{{ detail?.title ?? '求助详情' }}</h1>
        <p v-if="detail">
          <span class="tag" :class="detail.status === 'open' ? 'tag-open' : detail.status === 'answered' ? 'tag-on' : 'tag-off'">{{ STATUS_LABELS[detail.status] }}</span>
          {{ formatTime(detail.createdAt) }} 创建
        </p>
      </div>
      <div class="workspace-heading-actions">
        <RouterLink class="button secondary" to="/student/help-requests">← 我的求助</RouterLink>
      </div>
    </header>

    <p v-if="helpRequestId === null" class="notice notice-warn" role="alert">求助地址不正确，请从我的求助重新进入。</p>
    <template v-else>
      <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

      <template v-if="query.status.value === 'success' && detail">
        <section class="surface help-section" aria-labelledby="help-content-title">
          <h2 id="help-content-title">问题描述</h2>
          <p class="help-text">{{ detail.content }}</p>
          <h3>实际尝试</h3>
          <p class="help-text">{{ detail.studentAttempt }}</p>
          <p v-if="detail.issueTags.length > 0" class="help-tags-row">
            <span v-for="tag in detail.issueTags" :key="tag" class="tag">{{ tagTitle(tag) }}</span>
          </p>
        </section>

        <section v-if="detail.sharedSnapshot !== null || detail.sharedTutoringResults.length > 0" class="surface help-section" aria-labelledby="help-shared-title">
          <h2 id="help-shared-title">共享材料</h2>
          <template v-if="detail.sharedSnapshot !== null">
            <h3>工作区代码（版本 {{ detail.workspaceRevision }}）</h3>
            <p class="muted help-retention">保留至 {{ formatTime(detail.sharedSnapshot.expiresAt) }}</p>
            <details v-for="file in detail.sharedSnapshot.files" :key="file.path" class="help-file">
              <summary>{{ file.path }}</summary>
              <pre>{{ file.content }}</pre>
            </details>
          </template>
          <template v-if="detail.sharedTutoringResults.length > 0">
            <h3>AI 对话片段</h3>
            <blockquote v-for="shared in detail.sharedTutoringResults" :key="shared.requestId" class="help-shared-quote">
              <p v-if="shared.content !== null">{{ shared.content }}</p>
              <p v-else class="muted">该片段已过保留期限，不可查看。</p>
            </blockquote>
          </template>
        </section>

        <section class="surface help-section" aria-labelledby="help-replies-title">
          <h2 id="help-replies-title">教师回复</h2>
          <p v-if="detail.replies.length === 0" class="muted">教师尚未回复；回复后会收到消息提醒。</p>
          <ul v-else class="help-replies">
            <li v-for="reply in detail.replies" :key="reply.id">
              <p class="help-reply-meta"><strong>{{ reply.teacher.displayName }}</strong> · {{ formatTime(reply.createdAt) }}</p>
              <p class="help-text">{{ reply.content }}</p>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.help-section { padding: 22px 26px; margin-bottom: 20px; }
.help-section h2 { font-size: 18px; margin: 0 0 12px; }
.help-section h3 { font-size: 15px; margin: 16px 0 8px; }
.help-text { margin: 0; font-size: 14px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
.help-tags-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 0; }
.help-retention { font-size: 13px; margin: 0 0 8px; }
.help-file { border: 1px solid var(--line); border-radius: var(--radius-control); margin-bottom: 8px; }
.help-file summary { min-height: 44px; display: flex; align-items: center; padding: 0 14px; cursor: pointer; font-family: Consolas, monospace; font-size: 13px; color: var(--blue-text); }
.help-file pre { margin: 0; padding: 12px 14px; border-top: 1px solid var(--line); background: var(--canvas); font: 13px/1.8 Consolas, 'Microsoft YaHei', monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; }
.help-shared-quote { margin: 0 0 10px; padding: 10px 14px; border-left: 3px solid var(--blue); background: var(--blue-soft); border-radius: 0 var(--radius-control) var(--radius-control) 0; }
.help-shared-quote p { margin: 0; font-size: 14px; line-height: 1.7; }
.help-replies { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.help-reply-meta { margin: 0 0 4px; font-size: 13px; color: var(--muted); }
.tag-open { background: var(--orange-soft); color: var(--orange); }
</style>
