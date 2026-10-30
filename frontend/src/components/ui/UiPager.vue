<script setup lang="ts">
import UiButton from './UiButton.vue'

withDefaults(defineProps<{
  page: number
  total: number
  label: string
  meta?: string
}>(), { meta: '' })

const emit = defineEmits<{ 'update:page': [value: number] }>()
</script>

<template>
  <nav v-if="total > 1" class="pagination" :aria-label="label">
    <span v-if="meta" class="meta">{{ meta }}</span>
    <span class="pager">
      <UiButton variant="secondary" :disabled="page <= 1" @click="emit('update:page', page - 1)">上一页</UiButton>
      <UiButton variant="secondary" :disabled="page >= total" @click="emit('update:page', page + 1)">下一页</UiButton>
    </span>
  </nav>
</template>
