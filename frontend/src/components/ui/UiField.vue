<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  hint?: string | null
  error?: string | null
  col?: boolean
}>(), { col: false })
</script>

<template>
  <label class="field" :class="{ col }">
    <span>{{ label }}</span>
    <slot />
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="field-note">{{ hint }}</p>
  </label>
</template>
