<script setup lang="ts">
import type { CourseSummaryDTO } from '../../../api/courses'
import {subject} from './presentation'
defineProps<{course?:Pick<CourseSummaryDTO,'mark'|'title'>}>()
</script>
<template><span class="v35-subject" :data-family="subject(course?.mark).family"><span class="v35-subject-mark">{{course?.mark||'课程'}}</span><span>{{course?.title||'课程信息未返回'}}</span></span></template>
