<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { tutoringApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAuthStore } from '../../stores/auth'
import { formatTime } from '../courses/format'

const props = defineProps<{ offeringId: string }>()
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
const pageSize = 10
const query = usePageQuery(async signal => (await tutoringApi().listTeacherHelpRequests(props.offeringId, {
  page: page.value, pageSize,
  ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value }),
}, { signal })).data)
watch(() => props.offeringId, () => { page.value = 1; statusFilter.value = 'all'; void query.load() }, { immediate: true })
watch(statusFilter, () => { if (page.value !== 1) page.value = 1; else void query.load() })
watch(page, () => { void query.load() })
watch(() => auth.identity?.id, () => { page.value = 1; void query.load() })

const requests = computed(() => query.data.value?.items ?? [])
const totalPages = computed(() => Math.max(1, Math.ceil((query.data.value?.total ?? 0) / pageSize)))
const openCount = computed(() => query.data.value !== null && statusFilter.value === 'all'
  ? requests.value.filter(item => item.status === 'open').length
  : 0)
</script>

<template>
  <section class="teacher-help-panel" aria-labelledby="teacher-help-title">
    <header class="teacher-section-heading">
      <h2 id="teacher-help-title">学生求助</h2>
      <nav class="teacher-help-filters" aria-label="求助筛选">
        <button v-for="f in filters" :key="f.key" type="button" :aria-pressed="statusFilter === f.key" @click="statusFilter = f.key">{{ f.label }}</button>
      </nav>
    </header>
    <p v-if="openCount > 0" class="teacher-section-note">当前筛选中有 {{ openCount }} 条待处理求助。</p>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <template v-if="query.data.value">
      <p v-if="requests.length === 0" class="teacher-muted">没有符合条件的求助。</p>
      <ul v-else class="teacher-help-list">
        <li v-for="item in requests" :key="item.id">
          <div class="teacher-help-main">
            <RouterLink class="teacher-help-title" :to="{ name: 'teacher-help-request', params: { id: item.id } }">{{ item.title }}</RouterLink>
            <p>{{ item.student.displayName }}（{{ item.student.username }}）· {{ formatTime(item.updatedAt) }}</p>
          </div>
          <span class="tag" :class="item.status === 'open' ? 'tag-open' : item.status === 'answered' ? 'tag-on' : 'tag-off'">{{ STATUS_LABELS[item.status] }}</span>
        </li>
      </ul>
      <nav v-if="totalPages > 1" class="teacher-pagination" aria-label="求助分页">
        <span>{{ query.data.value.total }} 条</span>
        <div>
          <button type="button" class="button secondary" :disabled="page <= 1" @click="page -= 1">上一页</button>
          <button type="button" class="button secondary" :disabled="page >= totalPages" @click="page += 1">下一页</button>
        </div>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.teacher-help-filters { display: inline-flex; gap: 2px; padding: 3px; background: #e9edf3; border-radius: var(--radius-control); }
.teacher-help-filters button { min-height: 34px; padding: 0 12px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); font-size: 13px; cursor: pointer; }
.teacher-help-filters button[aria-pressed='true'] { background: var(--surface); color: var(--ink); font-weight: 600; }
.teacher-help-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-panel); overflow: hidden; }
.teacher-help-list li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; background: var(--surface); transition: background-color var(--dur-fast) ease; }
.teacher-help-list li:hover { background: var(--sunken); }
.teacher-help-list li + li { border-top: 1px solid var(--line); }
.teacher-help-main { display: grid; gap: 3px; min-width: 0; }
.teacher-help-title { color: var(--ink); font-weight: 600; font-size: 15px; text-decoration: none; overflow-wrap: anywhere; }
.teacher-help-title:hover { color: var(--blue-text); text-decoration: underline; }
.teacher-help-main p { margin: 0; font-size: 13px; color: var(--muted); }
.tag-open { background: var(--orange-soft); color: var(--orange); }
</style>
