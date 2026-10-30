<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'info' | 'warn' | 'error'
  role?: 'status' | 'alert' | 'note'
}>(), { tone: 'info' })
</script>

<template>
  <div class="notice" :class="`notice-${tone}`" :role="role ?? (tone === 'error' ? 'alert' : 'status')">
    <slot />
  </div>
</template>
