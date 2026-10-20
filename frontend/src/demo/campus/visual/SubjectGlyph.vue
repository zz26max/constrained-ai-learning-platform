<script setup lang="ts">
import Component from '../../../features/student/visual/SubjectGlyph.vue'

const props=defineProps<{mark?:string|null}>()
</script>
<template><Component v-bind="props"/></template>
