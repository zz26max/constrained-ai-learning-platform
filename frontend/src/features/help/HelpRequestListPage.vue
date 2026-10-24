<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { assignmentsApi, tutoringApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
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
  <div class="workspace-page help-list-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">我的求助</h1>
        <p>向任课教师描述问题；教师回复后会收到消息提醒。</p>
      </div>
    </header>

    <nav class="filter-tabs" aria-label="求助筛选">
      <button v-for="f in filters" :key="f.key" :aria-pressed="statusFilter === f.key" @click="statusFilter = f.key">{{ f.label }}</button>
    </nav>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <section v-if="query.data.value" class="surface help-list" aria-label="求助列表">
      <p v-if="requests.length === 0" class="muted help-empty">
        还没有求助记录。遇到卡住的问题，可在作业详情页发起求助。
      </p>
      <ul v-else>
        <li v-for="item in requests" :key="item.id">
          <div class="help-row-main">
            <RouterLink class="help-row-title" :to="{ name: 'student-help-request', params: { id: item.id } }">{{ item.title }}</RouterLink>
            <p class="muted">{{ assignmentTitle(item.assignmentId) }} · {{ formatTime(item.createdAt) }}</p>
          </div>
          <span class="tag" :class="item.status === 'open' ? 'tag-open' : item.status === 'answered' ? 'tag-on' : 'tag-off'">{{ STATUS_LABELS[item.status] }}</span>
        </li>
      </ul>
      <nav v-if="totalPages > 1" class="pagination" aria-label="求助分页">
        <button type="button" class="button secondary" :disabled="page <= 1" @click="page -= 1">上一页</button>
        <span>第 {{ page }} / {{ totalPages }} 页</span>
        <button type="button" class="button secondary" :disabled="page >= totalPages" @click="page += 1">下一页</button>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.filter-tabs { display: inline-flex; gap: 2px; padding: 4px; margin: 0 0 20px; background: #e9edf3; border-radius: var(--radius-panel); }
.filter-tabs button { min-height: 44px; padding: 0 16px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); font-size: 14px; cursor: pointer; }
.filter-tabs button[aria-pressed='true'] { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px #1c2d4914; }
.help-list { padding: 6px 0; }
.help-list ul { list-style: none; margin: 0; padding: 0; }
.help-list li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 22px; }
.help-list li + li { border-top: 1px solid var(--line); }
.help-row-main { display: grid; gap: 3px; min-width: 0; }
.help-row-title { color: var(--ink); font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }
.help-row-title:hover { color: var(--blue-text); }
.help-row-main p { margin: 0; font-size: 13px; }
.tag-open { background: var(--orange-soft); color: var(--orange); }
.help-empty { padding: 24px 22px; margin: 0; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding: 14px 0 10px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
</style>
