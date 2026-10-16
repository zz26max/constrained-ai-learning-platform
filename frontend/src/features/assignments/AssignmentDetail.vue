<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { assignmentsApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import StudentFeedbackView from './StudentFeedbackView.vue'
import { usePageQuery } from '../courses/use-page-query'
import { assignmentStateLabel, formatDueTime, isUuid } from './format'

const route = useRoute()
const api = assignmentsApi()

const assignmentId = computed(() => {
  const id = route.params.id
  return isUuid(id) ? id : ''
})

const query = usePageQuery(async signal => {
  const id = assignmentId.value
  if (!id) throw new Error('作业ID无效')
  const result = await api.getAssignment(id, { signal })
  return result.data
})

const feedbackQuery = usePageQuery(async signal => {
  const feedbackId = query.data.value?.publishedFeedbackId
  if (!feedbackId) return null
  return (await api.getFeedback(feedbackId, { signal })).data
})

watch(() => route.fullPath, async () => {
  await query.load()
  if (query.status.value === 'success') await feedbackQuery.load()
}, { immediate: true })

const canStartWork = computed(() => {
  const data = query.data.value
  if (!data) return false
  if (data.offeringStatus !== 'active') return false
  if (data.publicationState === 'archived') return false
  return true
})
</script>

<template>
  <div class="workspace-page reading-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">{{ query.data.value?.title ?? '作业详情' }}</h1>
        <p v-if="query.data.value">
          {{ formatDueTime(query.data.value.dueAt, query.data.value.overdue ?? false) }}
          · {{ assignmentStateLabel(query.data.value.assignmentState ?? 'NOT_STARTED') }}
        </p>
      </div>
      <RouterLink class="button secondary" to="/student/assignments">← 返回列表</RouterLink>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />

    <template v-if="query.status.value === 'success' && query.data.value">
      <p v-if="query.data.value.offeringStatus === 'archived'" class="notice notice-info">
        教学班已归档，作业为只读。
      </p>

      <section class="surface reading-content">
        <header class="section-heading">
          <h2>作业要求</h2>
          <span class="tag">{{ query.data.value.isRequired ? '必修' : '选修' }}</span>
        </header>

        <SafeMarkdown :content="query.data.value.description" />

        <section class="reading-section">
          <h3>具体要求</h3>
          <ul>
            <li v-for="(req, index) in query.data.value.requirements" :key="index">
              <SafeMarkdown :content="req" />
            </li>
          </ul>
        </section>

        <section v-if="query.data.value.rubric.length > 0" class="reading-section">
          <h3>评分标准</h3>
          <p class="muted">满分：{{ query.data.value.maxScore }} 分</p>
          <ul>
            <li v-for="criterion in query.data.value.rubric" :key="criterion.criterionId">
              <strong>{{ criterion.title }}</strong>
              （{{ criterion.maxScore }} 分）
              <p class="muted">{{ criterion.description }}</p>
            </li>
          </ul>
        </section>

        <section class="reading-section">
          <h3>开始作业</h3>
          <p v-if="!canStartWork" class="muted">
            {{ query.data.value.publicationState === 'archived' ? '作业已归档' : '教学班已归档' }}，无法编辑工作区。
          </p>
          <RouterLink
            v-else
            class="button"
            :to="{ name: 'student-workspace', params: { id: assignmentId } }"
          >
            进入工作区
          </RouterLink>
        </section>
      </section>

      <template v-if="query.data.value.publishedFeedbackId">
        <ApiState :status="feedbackQuery.status.value" :error="feedbackQuery.error.value" @retry="feedbackQuery.load" />
        <StudentFeedbackView
          v-if="feedbackQuery.status.value === 'success' && feedbackQuery.data.value"
          :feedback="feedbackQuery.data.value"
          :rubric="query.data.value.rubric"
        />
      </template>
    </template>
  </div>
</template>
