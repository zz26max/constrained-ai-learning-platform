<script setup lang="ts">
defineProps<{completed:number;total:number;title:string}>()
</script>
<template>
 <div class="vx-count-progress"><div class="vx-count-label"><span>已开放章节</span><span v-if="total"><strong>{{completed}}</strong> / {{total}} 已阅读</span><span v-else>尚未开放</span></div><div v-if="total" class="vx-segments" role="progressbar" :aria-label="title+'已开放章节阅读数量，不表示章节顺序'" :aria-valuenow="Math.round(completed/total*100)" aria-valuemin="0" aria-valuemax="100" :style="{'--segment-count':Math.min(total,20)}"><i v-for="n in Math.min(total,20)" :key="n" :style="{'--fill':Math.max(0,Math.min(1,completed/total*Math.min(total,20)-(n-1)))*100+'%'}" /></div></div>
</template>
