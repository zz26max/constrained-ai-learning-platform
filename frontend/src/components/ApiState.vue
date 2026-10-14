<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import type { RequestPhase } from '../stores/auth'
import type { PageError } from '../features/courses/page-error'
defineProps<{ status: RequestPhase; error?: PageError | null }>()
defineEmits<{ retry: [] }>()
const retryable = typeof getCurrentInstance()?.vnode.props?.['onRetry'] === 'function'
</script>
<template>
  <div v-if="status === 'loading'" class="state-block" role="status">正在加载…</div>
  <section v-else-if="status === 'error' && error" class="state-block notice-error" role="alert">
    <h2>{{ error.kind === 'not-found' ? '内容不存在或无权访问' : '暂时无法完成请求' }}</h2>
    <p>{{ error.message }}</p><p v-if="error.requestId" class="request-id">requestId: {{ error.requestId }}</p>
    <button v-if="retryable && error.kind !== 'not-found' && error.kind !== 'forbidden'" class="button secondary" type="button" @click="$emit('retry')">重新加载</button>
  </section>
</template>
