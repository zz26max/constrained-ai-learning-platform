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
  <div class="workspace-page tutoring-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">AI 辅导</h1>
        <p>引导式辅导：解释概念、指出方向，不提供完整实现。</p>
      </div>
      <div class="workspace-heading-actions">
        <RouterLink
          v-if="assignmentId !== null"
          class="button secondary"
          :to="{ name: 'student-assignment', params: { id: assignmentId } }"
        >
          ← 返回作业详情
        </RouterLink>
        <RouterLink class="button secondary" to="/student/assignments">作业列表</RouterLink>
      </div>
    </header>

    <p v-if="assignmentId === null" class="notice notice-warn" role="alert">作业地址不正确，请从作业列表重新进入。</p>
    <TutoringPanel v-else :assignment-id="assignmentId" />
  </div>
</template>
