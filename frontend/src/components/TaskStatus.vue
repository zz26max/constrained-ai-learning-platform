<script setup lang="ts">
import type { AssignmentSummaryDTO, AssignmentDetailDTO } from '../api/assignments'
import { assignmentStateLabel } from '../features/assignments/format'
import { deadlineLabel } from '../features/assignments/task-presentation'
defineProps<{task: AssignmentSummaryDTO; detail?: AssignmentDetailDTO}>()
</script>
<template>
  <div class="task-status">
    <span class="tag" :class="{'status-working':task.assignmentState==='IN_PROGRESS','status-reviewed':task.assignmentState==='REVIEWED'}">{{ task.assignmentState==='REVIEWED' ? '✓ 已批改' : assignmentStateLabel(task.assignmentState) }}</span>
    <span class="tag" :class="{'status-deadline':task.overdue || (Date.parse(task.dueAt)-Date.now()>0 && Date.parse(task.dueAt)-Date.now()<=86400000)}">{{ deadlineLabel(task.dueAt) }}</span>
    <span v-if="task.publicationState==='archived'||task.offeringStatus==='archived'" class="tag">已归档 · 只读</span>
    <span v-else-if="task.overdue && detail" class="tag status-deadline">{{ detail.canSubmit ? '可补交' : '不可提交' }}</span>
  </div>
</template>
