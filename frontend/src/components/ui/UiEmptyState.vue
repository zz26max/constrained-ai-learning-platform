<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <div class="empty-state">
    <h2 v-if="title">{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
