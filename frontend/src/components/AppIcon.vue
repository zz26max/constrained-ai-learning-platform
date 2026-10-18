<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const paths: Record<string, string> = {
  home: 'm3 10 9-7 9 7v10H3z M9 20v-7h6v7',
  book: 'M4 3h16v18H4z M8 3v18 M11 7h6 M11 11h6',
  clipboard: 'M8 5H5v16h14V5h-3 M9 3h6v4H9z M8 12h8 M8 16h6',
  chart: 'M4 20V10 M10 20V4 M16 20v-8 M22 20H2',
  calendar: 'M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'm6 6 12 12 M18 6 6 18',
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.book" /></svg></template>
