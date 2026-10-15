<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { assignmentsApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { assignmentStateLabel, formatDueTime } from './format'

const route = useRoute()
const api = assignmentsApi()

const query = usePageQuery(async signal => {
  const result = await api.listMyAssignments({}, { signal })
  return result.data
})

watch(() => route.fullPath, () => { void query.load() }, { immediate: true })

const sortedAssignments = computed(() => {
  if (!query.data.value?.items) return []
  return [...query.data.value.items].sort((a, b) => {
    const dueDiff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    if (dueDiff !== 0) return dueDiff
    return a.id.localeCompare(b.id)
  })
})
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">我的作业</h1>
        <p>查看全部作业、截止时间与提交状态</p>
      </div>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <template v-if="query.status.value === 'success' && query.data.value">
      <section class="surface">
        <header class="section-heading">
          <h2>作业列表</h2>
          <span class="tag">共 {{ query.data.value.summary?.allCount ?? 0 }} 项</span>
        </header>

        <p v-if="sortedAssignments.length === 0" class="muted">暂无作业。</p>

        <ul v-else class="resource-list">
          <li v-for="assignment in sortedAssignments" :key="assignment.id">
            <RouterLink :to="{ name: 'student-assignment', params: { id: assignment.id } }">
              <div>
                <span><strong>{{ assignment.title }}</strong></span>
                <span class="muted">{{ formatDueTime(assignment.dueAt, assignment.overdue) }}</span>
              </div>
              <div>
                <span :class="assignment.overdue ? 'tag tag-error' : 'tag'">{{ assignmentStateLabel(assignment.assignmentState) }}</span>
                <span v-if="assignment.latestSubmissionId" class="muted">→</span>
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
