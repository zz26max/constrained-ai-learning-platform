<script setup lang="ts">
import { computed } from 'vue'
const props=defineProps<{completed:number;total:number;title:string;refined?:boolean;showPercent?:boolean;percent?:number}>()
const segmentCount=computed(()=>props.refined?(props.total>12?1:props.total):Math.min(props.total,20))
</script>
<template>
 <div class="vx-count-progress" :data-mode="refined?(total>12?'continuous':'segmented'):undefined"><div class="vx-count-label"><span>已开放章节</span><span v-if="total"><strong>{{completed}}</strong> / {{total}} 已阅读<span v-if="showPercent" class="vx-progress-percent"> · {{percent??Math.round(completed/total*100)}}%</span></span><span v-else>尚未开放</span></div><div v-if="total" class="vx-segments" role="progressbar" :aria-label="title+'已开放章节阅读数量，不表示章节顺序'" :aria-valuenow="Math.round(completed/total*100)" aria-valuemin="0" aria-valuemax="100" :style="{'--segment-count':segmentCount}"><i v-for="n in segmentCount" :key="n" :style="{'--fill':Math.max(0,Math.min(1,completed/total*segmentCount-(n-1)))*100+'%'}" /></div></div>
</template>
