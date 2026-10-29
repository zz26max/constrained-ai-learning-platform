<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { assignmentsApi, tutoringApi } from '../../api'
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

const assignmentQuery = usePageQuery(async signal => {
  if (detail.value === null) throw new Error('尚未读取到求助')
  return (await assignmentsApi().getAssignment(detail.value.assignmentId, { signal })).data
})
watch(() => detail.value?.assignmentId, () => { if (detail.value !== null) void assignmentQuery.load() })

function tagTitle(tag: string): string {
  return tagsQuery.data.value?.items.find(item => item.tag === tag)?.title ?? tag
}
</script>

<template>
  <div class="workspace-page sr-help-detail">
    <header class="page-head">
      <div>
        <p class="page-eyebrow"><RouterLink to="/student/help-requests">← 我的求助</RouterLink></p>
        <h1 class="page-title" tabindex="-1">{{ detail?.title ?? '求助详情' }}</h1>
        <p v-if="detail" class="page-meta">
          <span class="chip" :data-status="detail.status">{{ STATUS_LABELS[detail.status] }}</span>
          <span>{{ formatTime(detail.createdAt) }} 发起</span>
          <RouterLink :to="{ name: 'student-assignment', params: { id: detail.assignmentId } }">{{ assignmentQuery.data.value?.title ?? '查看作业' }}</RouterLink>
          <span v-for="tag in detail.issueTags" :key="tag" class="tag">{{ tagTitle(tag) }}</span>
        </p>
      </div>
    </header>

    <p v-if="helpRequestId === null" class="notice notice-warn" role="alert">求助地址不正确，请从我的求助重新进入。</p>
    <template v-else>
      <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

      <div v-if="query.status.value === 'success' && detail" class="help-body">
        <section class="help-sec" aria-labelledby="help-content-title">
          <h2 id="help-content-title">我的问题</h2>
          <p class="help-text">{{ detail.content }}</p>
          <h3>我的尝试</h3>
          <p class="help-text">{{ detail.studentAttempt }}</p>
        </section>

        <section v-if="detail.sharedSnapshot" class="help-sec" aria-labelledby="help-snapshot-title">
          <div class="sec-head">
            <h2 id="help-snapshot-title">附上的工作区快照</h2>
            <span class="meta">{{ detail.workspaceRevision ? `r${detail.workspaceRevision} · ` : '' }}保留至 {{ formatTime(detail.sharedSnapshot.expiresAt) }}</span>
          </div>
          <details v-for="file in detail.sharedSnapshot.files ?? []" :key="file.path" class="snap-file">
            <summary><code>{{ file.path }}</code></summary>
            <pre>{{ file.content }}</pre>
          </details>
          <p v-if="detail.sharedSnapshot.contentUnavailableReason" class="meta">快照已过保留期，无法查看。</p>
        </section>

        <section v-if="detail.sharedTutoringResults.length > 0" class="help-sec" aria-labelledby="help-ai-title">
          <h2 id="help-ai-title">附上的 AI 提示</h2>
          <div v-for="shared in detail.sharedTutoringResults" :key="shared.requestId" class="quote">
            <p v-if="shared.content !== null" class="help-text">{{ shared.content }}</p>
            <p v-else class="meta">内容已过保留期，无法查看。</p>
            <p class="meta">保留至 {{ formatTime(shared.expiresAt) }}</p>
          </div>
        </section>

        <section class="help-sec" aria-labelledby="help-replies-title">
          <h2 id="help-replies-title">教师回复</h2>
          <p v-if="detail.replies.length === 0" class="meta">老师还没有回复。回复后会收到「求助回复」消息。</p>
          <div v-else class="replies">
            <article v-for="reply in detail.replies" :key="reply.id" class="reply">
              <p class="meta">{{ reply.teacher.displayName }} · {{ formatTime(reply.createdAt) }}</p>
              <p class="help-text">{{ reply.content }}</p>
            </article>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
