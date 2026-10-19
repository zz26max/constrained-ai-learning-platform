<script setup lang="ts">
import type {NotificationDTO} from '../../../api/assignments'
defineProps<{type:NotificationDTO['type']}>()
const paths:Record<NotificationDTO['type'],string>={
 assignment_published:'M8 5H5v16h14V5h-3 M9 3h6v4H9z M8 12h8 M8 16h6',
 feedback:'M4 4h16v13H9l-5 4z M8 10l3 3 5-6',
 course_notice:'M4 10l13-5v14L4 14z M17 9l4-2v10l-4-2 M7 15l2 6h3',
 system:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
 help_reply:'M4 4h16v13H9l-5 4z M8 9h8 M8 12h5',
}
</script>
<template><span class="v35-message-glyph" :data-type="type" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path :d="paths[type]"/></svg></span></template>
