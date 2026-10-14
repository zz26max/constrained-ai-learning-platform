<script setup lang="ts">
import type { PageError } from '../features/courses/page-error'
defineProps<{ error: PageError | null; message: string | null }>()
</script>
<template>
  <div v-if="error" class="notice notice-error" role="alert"><p>{{ error.message }}</p><p v-if="error.requestId" class="request-id">requestId: {{ error.requestId }}</p></div>
  <p v-else-if="message" class="notice notice-info" role="status">{{ message }}</p>
</template>
