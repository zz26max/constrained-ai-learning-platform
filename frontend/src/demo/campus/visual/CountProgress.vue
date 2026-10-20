<script setup lang="ts">
import Component from '../../../features/student/visual/CountProgress.vue'

const props=defineProps<{completed:number;total:number;title:string;refined?:boolean;showPercent?:boolean;percent?:number}>()
</script>
<template><Component v-bind="props"/></template>
