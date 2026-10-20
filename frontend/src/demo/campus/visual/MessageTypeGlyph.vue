<script setup lang="ts">
import Component from '../../../features/student/visual/MessageTypeGlyph.vue'
import type {NotificationDTO} from '../../../api/assignments'
const props=defineProps<{type:NotificationDTO['type']}>()
</script>
<template><Component v-bind="props"/></template>
