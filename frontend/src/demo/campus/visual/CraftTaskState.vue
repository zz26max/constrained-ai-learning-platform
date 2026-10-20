<script setup lang="ts">
import {visualVersion} from './mode'
import TaskState from '../../../features/student/visual/CraftTaskState.vue'
import type {AssignmentSummaryDTO,AssignmentDetailDTO} from '../../../api/assignments'
withDefaults(defineProps<{task:AssignmentSummaryDTO;detail?:AssignmentDetailDTO;showDeadline?:boolean}>(),{showDeadline:true})
</script>
<template><TaskState :task="task" :detail="detail" :show-deadline="showDeadline" :polished="visualVersion==='v361'"/></template>
