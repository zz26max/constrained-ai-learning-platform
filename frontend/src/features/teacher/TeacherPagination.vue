<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ page: number; pageSize: number; total: number; pending?: boolean; label: string }>()
const emit = defineEmits<{ change: [page: number] }>()
const lastPage = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>

<template>
  <nav class="teacher-pagination" :aria-label="`${label}分页`">
    <span>第 {{ page }} 页 · 共 {{ total }} 条</span>
    <div v-if="lastPage > 1">
      <button type="button" class="button secondary" :disabled="pending || page <= 1" @click="emit('change', page - 1)">上一页</button>
      <button type="button" class="button secondary" :disabled="pending || page >= lastPage" @click="emit('change', page + 1)">下一页</button>
    </div>
  </nav>
</template>
