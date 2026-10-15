<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { assignmentsApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from './use-assignment-actions'
import { formatDueTime, isUuid } from './format'

const route = useRoute()
const api = assignmentsApi()
const actions = useAssignmentActions()

const offeringId = computed(() => {
  const id = route.params.offeringId
  return isUuid(id) ? id : ''
})

const query = usePageQuery(async signal => {
  const id = offeringId.value
  if (!id) throw new Error('教学班ID无效')
  const result = await api.listTeacherAssignments(id, {}, { signal })
  return result.data
})

watch(() => route.fullPath, () => { void query.load() }, { immediate: true })

const publishedAssignments = computed(() => {
  return query.data.value?.items.filter(a => a.publicationState === 'published') ?? []
})

const draftAssignments = computed(() => {
  return query.data.value?.items.filter(a => a.publicationState === 'draft') ?? []
})

const archivedAssignments = computed(() => {
  return query.data.value?.items.filter(a => a.publicationState === 'archived') ?? []
})

async function publishAssignment(id: string): Promise<void> {
  const result = await actions.run(
    token => api.publishAssignment(id, { csrfToken: token }),
    '作业已发布'
  )
  if (result) await query.load()
}

async function archiveAssignment(id: string): Promise<void> {
  const result = await actions.run(
    token => api.archiveAssignment(id, { csrfToken: token }),
    '作业已归档'
  )
  if (result) await query.load()
}
</script>

<template>
  <div class="workspace-page teacher-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">作业管理</h1>
        <p>管理本教学班的全部作业</p>
      </div>
      <RouterLink
        class="button"
        :to="{ name: 'teacher-assignment-new', params: { offeringId } }"
      >
        创建作业
      </RouterLink>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <template v-if="query.status.value === 'success'">
      <section v-if="publishedAssignments.length > 0" class="surface">
        <header class="section-heading">
          <h2>已发布作业</h2>
          <span class="tag">{{ publishedAssignments.length }} 项</span>
        </header>
        <ul class="resource-list">
          <li v-for="assignment in publishedAssignments" :key="assignment.id">
            <RouterLink :to="{ name: 'teacher-assignment', params: { id: assignment.id } }">
              <div>
                <span><strong>{{ assignment.title }}</strong></span>
                <span class="muted">{{ formatDueTime(assignment.dueAt, false) }}</span>
              </div>
              <div>
                <span class="muted">{{ assignment.submittedStudentCount }} 提交 / {{ assignment.pendingReviewCount }} 待评</span>
                <button
                  type="button"
                  class="button secondary small"
                  :disabled="actions.pending.value"
                  @click.prevent="archiveAssignment(assignment.id)"
                >
                  归档
                </button>
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="draftAssignments.length > 0" class="surface">
        <header class="section-heading">
          <h2>草稿</h2>
          <span class="tag">{{ draftAssignments.length }} 项</span>
        </header>
        <ul class="resource-list">
          <li v-for="assignment in draftAssignments" :key="assignment.id">
            <RouterLink :to="{ name: 'teacher-assignment', params: { id: assignment.id } }">
              <div>
                <span><strong>{{ assignment.title }}</strong></span>
                <span class="tag tag-draft">草稿</span>
              </div>
              <button
                type="button"
                class="button primary small"
                :disabled="actions.pending.value"
                @click.prevent="publishAssignment(assignment.id)"
              >
                发布
              </button>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="archivedAssignments.length > 0" class="surface">
        <header class="section-heading">
          <h2>已归档</h2>
          <span class="tag">{{ archivedAssignments.length }} 项</span>
        </header>
        <ul class="resource-list">
          <li v-for="assignment in archivedAssignments" :key="assignment.id">
            <RouterLink :to="{ name: 'teacher-assignment', params: { id: assignment.id } }">
              <span><strong>{{ assignment.title }}</strong></span>
              <span class="tag">已归档</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <p v-if="query.data.value?.items.length === 0" class="muted">
        暂无作业，点击右上角"创建作业"开始。
      </p>
    </template>
  </div>
</template>
