<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'plain' | 'quiet'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  block?: boolean
}>(), { variant: 'plain', type: 'button' })
</script>

<template>
  <button
    :type="type"
    :class="[variant === 'quiet' ? 'quiet-btn' : 'button', variant === 'primary' || variant === 'secondary' ? variant : '', { block }]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
