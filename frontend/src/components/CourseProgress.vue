<script setup lang="ts">
import type { components } from '../api/generated/schema'
defineProps<{ progress: components['schemas']['ProgressDTO']; title?: string }>()
</script>
<template>
  <div class="course-progress">
    <span>{{ progress.unit === 'chapter' ? '章节进度' : progress.unit === 'assignment' ? '作业进度' : '不兼容的进度单位' }}</span>
    <div class="progress-track" role="progressbar" :aria-label="(title ?? '课程') + '进度'" :aria-valuenow="progress.percent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: progress.percent + '%' }" /></div>
    <span>{{ progress.completed }} / {{ progress.total }} <strong>{{ progress.percent }}%</strong></span>
    <span v-if="progress.notConfigured">进度未配置</span>
  </div>
</template>
