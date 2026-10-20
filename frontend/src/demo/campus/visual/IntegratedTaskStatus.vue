<script setup lang="ts">
import Component from '../../../features/student/visual/IntegratedTaskStatus.vue'
import type {AssignmentSummaryDTO,AssignmentDetailDTO} from '../../../api/assignments'
const props=withDefaults(defineProps<{task:AssignmentSummaryDTO;detail?:AssignmentDetailDTO;showDeadline?:boolean}>(),{showDeadline:true})
</script>
<template><Component v-bind="props"/></template>
