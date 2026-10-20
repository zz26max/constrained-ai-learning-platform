<script setup lang="ts">
import Component from '../../../features/student/visual/CraftDate.vue'

const props=defineProps<{value:string}>()
</script>
<template><Component v-bind="props"/></template>
