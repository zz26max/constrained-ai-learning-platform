<script setup lang="ts">
import {useRoute,useRouter} from 'vue-router'
import {visualVersion,switchVersion} from './mode'
const route=useRoute(),router=useRouter()
function direction(value:string){void router.replace({query:{...route.query,craft:value||undefined}})}
</script>
<template><div class="vc-switcher"><strong>V3.6 · 视觉工艺评审</strong><div role="group" aria-label="预览版本"><button :aria-pressed="visualVersion==='v35'" @click="switchVersion('v35',router)">V3.5 对照</button><button :aria-pressed="visualVersion==='v36'" @click="switchVersion('v36',router)">V3.6 候选</button><select aria-label="局部设计方向" :value="route.query.craft??''" :disabled="visualVersion!=='v36'" @change="direction(($event.target as HTMLSelectElement).value)"><option value="">收敛方案</option><option value="a">方向 A</option><option value="b">方向 B</option></select></div><small>相同演示数据 · 未替换正式页面 · <a href="/campus.html?explore=v35#/student/home?visual=v35">历史版本入口</a></small></div></template>
<style scoped>
.vc-switcher{display:flex;gap:12px 20px;align-items:center;flex-wrap:wrap;padding:8px 20px;background:#edf1f7;color:#30415d;font-size:13px;border-bottom:1px solid #c8d2e1}.vc-switcher>div{display:flex;gap:4px}.vc-switcher button,.vc-switcher select{min-height:44px;border:1px solid #8b9db8;border-radius:6px;padding:0 10px;background:white;color:inherit;font-size:12px}.vc-switcher button[aria-pressed=true]{background:#254caa;border-color:#254caa;color:white}.vc-switcher select{max-width:112px}.vc-switcher small{font-size:12px}.vc-switcher a{color:#254caa}@media(max-width:600px){.vc-switcher{padding:6px 16px}.vc-switcher strong,.vc-switcher small{display:none}.vc-switcher button{padding:0 8px}}
</style>
