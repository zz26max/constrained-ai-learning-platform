<script setup lang="ts">
import { subject } from './presentation'
defineProps<{mark?:string|null}>()
</script>
<template>
 <span class="vx-glyph" :data-family="subject(mark).family" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
 <template v-if="subject(mark).family==='code'"><path d="m23 18-13 14 13 14m18-28 13 14-13 14M37 12 27 52"/><path v-if="mark==='WEB'" d="M8 8h48v48H8z" opacity=".35"/></template>
 <template v-else-if="subject(mark).family==='data'"><template v-if="mark==='DSA'"><path d="M32 16v16M15 32h34M15 32v15m34-15v15"/><rect x="26" y="7" width="12" height="12" rx="2"/><rect x="9" y="45" width="12" height="12" rx="2"/><rect x="43" y="45" width="12" height="12" rx="2"/></template><template v-else><ellipse cx="32" cy="14" rx="20" ry="8"/><path d="M12 14v18c0 11 40 11 40 0V14M12 32v17c0 11 40 11 40 0V32"/></template></template>
 <template v-else-if="subject(mark).family==='systems'"><path d="M32 14v14m0 8v14M14 32h14m8 0h14M18 18l10 10m8 8 10 10"/><rect x="26" y="26" width="12" height="12" rx="3"/><circle cx="32" cy="9" r="5"/><circle cx="9" cy="32" r="5"/><circle cx="55" cy="32" r="5"/><circle cx="32" cy="55" r="5"/></template>
 <template v-else-if="subject(mark).family==='explore'"><circle cx="32" cy="32" r="9"/><path d="M32 5v12m0 30v12M5 32h12m30 0h12M13 13l9 9m20 20 9 9M51 13l-9 9M22 42l-9 9"/><circle cx="32" cy="32" r="23" opacity=".35"/></template>
 <template v-else><path d="M9 12h19l4 6 4-6h19v39H36l-4 5-4-5H9zM32 18v38"/></template>
 </svg><span>{{mark||'课程'}}</span></span>
</template>
