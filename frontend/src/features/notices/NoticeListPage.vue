<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { noticesApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatTime } from '../courses/format'
import { isUuid } from '../assignments/format'

const route = useRoute()
const api = noticesApi()
const PAGE_SIZE = 20
const page = ref(1)

const offeringId = computed(() => route.params['offeringId'])
const invalidLink = computed(() => !isUuid(offeringId.value))

const query = usePageQuery(async signal => {
  const id = offeringId.value
  if (!isUuid(id)) throw new Error('链接无效')
  return (await api.listNotices(id, { page: page.value, pageSize: PAGE_SIZE }, { signal })).data
})

watch(() => route.params['offeringId'], () => {
  page.value = 1
  if (!invalidLink.value) void query.load()
}, { immediate: true })
watch(page, () => { if (!invalidLink.value) void query.load() })

const totalPages = computed(() => Math.max(1, Math.ceil((query.data.value?.total ?? 0) / PAGE_SIZE)))

function excerpt(text: string): string {
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}
</script>

<template>
  <div class="workspace-page dashboard-page">
    <header class="workspace-heading">
      <div><h1 tabindex="-1">课程公告</h1></div>
      <RouterLink v-if="!invalidLink" class="button secondary" :to="{ name: 'course', params: { offeringId: offeringId as string } }">← 返回课程</RouterLink>
      <RouterLink v-else class="button secondary" to="/course">← 我的课程</RouterLink>
    </header>

    <section v-if="invalidLink" class="surface state-block notice-error" role="alert">
      <h2>链接无效</h2>
      <RouterLink class="button secondary" to="/course">返回我的课程</RouterLink>
    </section>

    <template v-else>
      <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
      <section v-if="query.status.value === 'success' && query.data.value" class="surface dash-section" aria-label="公告列表">
        <p v-if="query.data.value.items.length === 0" class="muted">本课程暂无公告</p>
        <ul v-else class="dash-list notice-list">
          <li v-for="notice in query.data.value.items" :key="notice.id">
            <h2 class="notice-title"><RouterLink :to="{ name: 'student-notice', params: { noticeId: notice.id } }">{{ notice.title }}</RouterLink></h2>
            <time class="muted" :datetime="notice.createdAt">{{ formatTime(notice.createdAt) }}</time>
            <p class="dash-text">{{ excerpt(notice.content) }}</p>
          </li>
        </ul>
        <nav v-if="totalPages > 1" class="pagination" aria-label="公告分页">
          <button type="button" class="button secondary" :disabled="page <= 1" @click="page -= 1">上一页</button>
          <span>第 {{ page }} / {{ totalPages }} 页</span>
          <button type="button" class="button secondary" :disabled="page >= totalPages" @click="page += 1">下一页</button>
        </nav>
      </section>
    </template>
  </div>
</template>
