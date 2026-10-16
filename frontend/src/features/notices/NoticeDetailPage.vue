<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { noticesApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { formatTime } from '../courses/format'
import { isUuid } from '../assignments/format'
import { useOpenTarget } from '../notifications/use-open-target'

const route = useRoute()
const api = noticesApi()
const opener = useOpenTarget()

const noticeId = computed(() => route.params['noticeId'])
const invalidLink = computed(() => !isUuid(noticeId.value))

const query = usePageQuery(async signal => {
  const id = noticeId.value
  if (!isUuid(id)) throw new Error('链接无效')
  return (await api.getNotice(id, { signal })).data
})

watch(() => route.params['noticeId'], () => { if (!invalidLink.value) void query.load() }, { immediate: true })
</script>

<template>
  <div class="workspace-page dashboard-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">{{ query.data.value?.title ?? '公告详情' }}</h1>
        <p v-if="query.data.value"><time :datetime="query.data.value.createdAt">{{ formatTime(query.data.value.createdAt) }}</time></p>
      </div>
      <RouterLink v-if="query.data.value" class="button secondary" :to="{ name: 'student-notices', params: { offeringId: query.data.value.offeringId } }">← 公告列表</RouterLink>
      <RouterLink v-else class="button secondary" to="/course">← 我的课程</RouterLink>
    </header>

    <section v-if="invalidLink" class="surface state-block notice-error" role="alert">
      <h2>链接无效</h2>
      <RouterLink class="button secondary" to="/course">返回我的课程</RouterLink>
    </section>

    <template v-else>
      <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
      <section v-if="query.status.value === 'success' && query.data.value" class="surface dash-section">
        <p class="notice-content">{{ query.data.value.content }}</p>
        <ActionNotice :error="opener.error.value" :message="null" />
        <button v-if="opener.canOpen(query.data.value.target)" type="button" class="button primary" @click="opener.open(query.data.value.target)">查看相关内容</button>
      </section>
    </template>
  </div>
</template>
