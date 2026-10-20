<script setup lang="ts">
import Component from '../../../features/student/visual/SubjectIdentity.vue'
import type {CourseSummaryDTO} from '../../../api/courses'
const props=defineProps<{course?:Pick<CourseSummaryDTO,'mark'|'title'>}>()
</script>
<template><Component v-bind="props"/></template>
