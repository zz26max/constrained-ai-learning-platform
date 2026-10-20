<script setup lang="ts">
import {visualVersion} from './mode'
import type {AssignmentSummaryDTO,AssignmentDetailDTO} from '../../../api/assignments'
import {assignmentStateLabel} from '../../../features/assignments/format'
import {deadlineLabel} from '../../../features/assignments/task-presentation'
import {submissionLabel} from './refinement'
withDefaults(defineProps<{task:AssignmentSummaryDTO;detail?:AssignmentDetailDTO;showDeadline?:boolean}>(),{showDeadline:true})
</script>
<template><div class="task-status vc-task-state"><span class="vc-process" :data-state="task.assignmentState" aria-label="作答进度"><i aria-hidden="true"/>{{assignmentStateLabel(task.assignmentState)}}</span><span v-if="showDeadline" class="vc-state-time" aria-label="截止状态">{{deadlineLabel(task.dueAt)}}</span><span class="vc-permission" :class="{'is-late':task.overdue&&detail?.canSubmit}" aria-label="提交资格">{{task.publicationState==='archived'||task.offeringStatus==='archived'?'已归档 · 只读':visualVersion==='v361'&&task.overdue&&detail?.canSubmit?'已逾期，可补交':submissionLabel(detail)}}</span></div></template>
