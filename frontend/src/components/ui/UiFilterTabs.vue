<script setup lang="ts">
defineProps<{
  items: readonly { key: string; label: string; count?: number }[]
  modelValue: string
  label: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <nav class="filter-tabs" :aria-label="label">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      :aria-pressed="modelValue === item.key"
      @click="emit('update:modelValue', item.key)"
    >
      {{ item.label }}<span v-if="item.count !== undefined"> {{ item.count }}</span>
    </button>
  </nav>
</template>
