<script setup lang="ts">
import {computed} from 'vue'
import {beijingTime} from './presentation'
const props=defineProps<{value:string;dayOnly?:boolean}>()
const parts=computed(()=>{
 const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(props.value))
 const get=(type:string)=>parts.find(p=>p.type===type)?.value??''
 return {year:get('year'),month:get('month'),day:get('day'),currentYear:new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric'}).formatToParts(new Date()).find(p=>p.type==='year')?.value}
})
</script>
<template><time class="vc-date" :datetime="value" :aria-label="dayOnly?`${parts.year}年${parts.month}月${parts.day}日 北京时间`:`${parts.year}年${parts.month}月${parts.day}日 ${beijingTime(value)} 北京时间`"><span class="vc-date-month"><span v-if="parts.year!==parts.currentYear" class="vc-date-year">{{parts.year}} · </span>{{parts.month}}月</span><strong class="vc-date-day">{{parts.day.padStart(2,'0')}}</strong><span v-if="!dayOnly" class="vc-date-time">{{beijingTime(value)}}</span></time></template>
