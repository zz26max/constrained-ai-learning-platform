<script setup lang="ts">
import {compactDeadline} from '../../../features/dashboard/bplus-presentation'
import {beijingTime} from './presentation'
defineProps<{value:string}>()
</script>
<template><time class="v35-deadline" :datetime="value" :title="value+'（时间按北京时间显示）'"><strong>{{compactDeadline(value,undefined,false).split(' ')[0]}}</strong><span>{{beijingTime(value)}} · 北京时间</span></time></template>
