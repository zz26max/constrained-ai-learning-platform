<script setup lang="ts">
import { visualVersion,switchVersion } from './mode'
import { useRouter } from 'vue-router'
const router=useRouter()
</script>
<template><div class="vx-switcher"><strong>三版本设计对比</strong><div role="group" aria-label="预览版本"><button :aria-pressed="visualVersion==='v33'" @click="switchVersion('v33',router)">V3.3 对照</button><button :aria-pressed="visualVersion==='v34'" @click="switchVersion('v34',router)">V3.4 预览</button><button :aria-pressed="visualVersion==='v341'" @click="switchVersion('v341',router)">V3.4.1 精修</button></div><small>仅课程、记录、日历 · 同一内存数据 · 未替换正式页面</small></div></template>
<style scoped>
.vx-switcher{display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap;color:#253656;font-size:13px;padding:8px 20px;background:#edf2fc;border-bottom:1px solid #cbd7ee}.vx-switcher>div{display:flex;gap:4px}.vx-switcher button{min-height:44px;padding:0 12px;background:transparent;border:1px solid #92a6c9;border-radius:6px;color:inherit;cursor:pointer}.vx-switcher button[aria-pressed=true]{background:#254caa;color:white;border-color:#254caa}.vx-switcher small{font-size:12px;color:#4b5f80}@media(max-width:600px){.vx-switcher{padding:6px 16px;gap:4px 8px}.vx-switcher strong{display:none}.vx-switcher button{font-size:12px;padding:0 8px}.vx-switcher small{display:none}}
</style>
