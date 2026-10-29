<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import TutoringPanel from '../tutoring/TutoringPanel.vue'
import { isUuid } from '../assignments/format'

const route = useRoute()
const assignmentId = computed(() => {
  const value = route.params.id
  return typeof value === 'string' && isUuid(value) ? value : null
})
</script>

<template>
  <div class="workspace-page sr-tutoring">
    <header class="page-head">
      <div>
        <p v-if="assignmentId !== null" class="page-eyebrow"><RouterLink :to="{ name: 'student-assignment', params: { id: assignmentId } }">← 作业详情</RouterLink></p>
        <h1 class="page-title" tabindex="-1">AI 辅导</h1>
      </div>
      <p v-if="assignmentId !== null" class="page-actions">
        <RouterLink class="quiet-link" :to="{ name: 'student-workspace', params: { id: assignmentId } }">回到工作区</RouterLink>
      </p>
    </header>

    <p v-if="assignmentId === null" class="notice notice-warn" role="alert">作业地址不正确，请从作业列表重新进入。</p>
    <TutoringPanel v-else :assignment-id="assignmentId" />
  </div>
</template>
