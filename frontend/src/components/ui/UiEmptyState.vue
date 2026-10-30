<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  role?: string
}>()
</script>

<template>
  <div class="empty-state" :role="role">
    <h2 v-if="title">{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
