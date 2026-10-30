<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { assignmentsApi, tutoringApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import UiEmptyState from '../../components/ui/UiEmptyState.vue'
import UiFilterTabs from '../../components/ui/UiFilterTabs.vue'
import UiPager from '../../components/ui/UiPager.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'
import { formatTime } from '../courses/format'

const auth = useAuthStore()
const statusFilter = ref<'all' | 'open' | 'answered' | 'closed'>('all')
const filters = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待处理' },
  { key: 'answered', label: '已回复' },
  { key: 'closed', label: '已关闭' },
] as const
const STATUS_LABELS = { open: '待处理', answered: '已回复', closed: '已关闭' } as const

const page = ref(1)
const pageSize = 20
const query = usePageQuery(async signal => (await tutoringApi().listHelpRequests({
  page: page.value, pageSize,
  ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value }),
}, { signal })).data)
watch(statusFilter, () => { if (page.value !== 1) page.value = 1; else void query.load() }, { immediate: true })
watch(page, () => { void query.load() })
watch(() => auth.identity?.id, () => { page.value = 1; void query.load() })

const requests = computed(() => query.data.value?.items ?? [])
const totalPages = computed(() => Math.max(1, Math.ceil((query.data.value?.total ?? 0) / pageSize)))
function setStatusFilter(key: string): void { statusFilter.value = key as typeof statusFilter.value }

/** 摘要只有 assignmentId；用我的作业列表把标题补上，避免列表里出现裸 UUID。 */
const titlesQuery = usePageQuery(async signal => {
  const map = new Map<string, string>()
  let current = 1
  for (;;) {
    const result = (await assignmentsApi().listMyAssignments({ page: current, pageSize: 50 }, { signal })).data
    for (const item of result.items) map.set(item.id, item.title)
    if (current * 50 >= result.total) return map
    current += 1
  }
})
watch(() => auth.identity?.id, () => { void titlesQuery.load() }, { immediate: true })
function assignmentTitle(id: string): string {
  return titlesQuery.data.value?.get(id) ?? '未知作业'
}
</script>

<template>
  <div class="workspace-page sr-help-list">
    <header class="page-head">
      <div>
        <h1 class="page-title" tabindex="-1">我的求助</h1>
        <p class="page-summary">求助都关联到具体作业，从作业详情的「问老师」发起。</p>
      </div>
    </header>

    <UiFilterTabs :items="filters" :model-value="statusFilter" label="求助筛选" @update:model-value="setStatusFilter" />

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <section v-if="query.data.value" aria-label="求助列表">
      <UiEmptyState v-if="requests.length === 0">没有符合条件的求助。做作业遇到问题时，可以先用 AI 辅导，仍解决不了再问老师。</UiEmptyState>
      <ul v-else class="rows">
        <li v-for="item in requests" :key="item.id">
          <RouterLink class="row" :to="{ name: 'student-help-request', params: { id: item.id } }">
            <div class="grow">
              <b>{{ item.title }}</b>
              <span class="meta">{{ assignmentTitle(item.assignmentId) }} · {{ formatTime(item.createdAt) }}</span>
            </div>
            <span class="chip" :data-status="item.status">{{ STATUS_LABELS[item.status] }}</span>
          </RouterLink>
        </li>
      </ul>
      <UiPager :page="page" :total="totalPages" label="求助分页" :meta="`第 ${page} / ${totalPages} 页`" @update:page="page = $event" />
    </section>
  </div>
</template>
