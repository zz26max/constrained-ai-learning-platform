<script setup lang="ts">
import type {AssignmentSummaryDTO,AssignmentDetailDTO} from '../../../api/assignments'
import {assignmentStateLabel} from '../../../features/assignments/format'
import {deadlineLabel} from '../../../features/assignments/task-presentation'
import {submissionLabel} from './refinement'
withDefaults(defineProps<{task:AssignmentSummaryDTO;detail?:AssignmentDetailDTO;showDeadline?:boolean}>(),{showDeadline:true})
</script>
<template><div class="task-status v35-task-status"><span class="v35-progress-state" :data-state="task.assignmentState"><small>进度</small>{{assignmentStateLabel(task.assignmentState)}}</span><span v-if="showDeadline" class="v35-time-state"><small>时间</small>{{deadlineLabel(task.dueAt)}}</span><span class="v35-qualification" :class="{'is-late':task.overdue&&detail?.canSubmit}"><small>资格</small>{{task.publicationState==='archived'||task.offeringStatus==='archived'?'已归档 · 只读':submissionLabel(detail)}}</span></div></template>
