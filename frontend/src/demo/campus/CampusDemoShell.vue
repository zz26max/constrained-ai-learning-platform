<script setup lang="ts">
import App from '../../app/App.vue'
import { ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
const exploration=['v34','v35'].includes(new URLSearchParams(location.search).get('explore')??'')
const VisualSwitcher=defineAsyncComponent(()=>import('./visual/VisualSwitcher.vue'))
const craft=['v36','v361'].includes(new URLSearchParams(location.search).get('explore')??'')
const CraftSwitcher=defineAsyncComponent(()=>import('./visual/CraftSwitcher.vue'))
const marker=ref<HTMLElement|null>(null)
let observer:ResizeObserver|undefined
onMounted(()=>{observer=new ResizeObserver(()=>document.documentElement.style.setProperty('--campus-marker-height',`${marker.value?.offsetHeight??0}px`));if(marker.value)observer.observe(marker.value)})
onBeforeUnmount(()=>observer?.disconnect())
function reset() { window.location.reload() }
</script>
<template>
  <div class="campus-preview">
    <div ref="marker" class="campus-marker-stack"><aside class="campus-marker" aria-label="高校演示环境">
      <strong>高校演示 · 虚构数据</strong>
      <span>演示日期：2026-10-19 10:00（北京时间）</span>
      <button type="button" @click="reset">重置演示</button>
      <details><summary>隔离与操作说明</summary><p>课程阅读、工作区保存、模拟提交与消息已读仅保存在本页内存；刷新即重置。不会访问正式接口或数据库。教师、AI 辅导、真实评测和选课操作未包含在演示中。演示账号：campus.student / campus-preview。</p></details>
    </aside><CraftSwitcher v-if="craft"/><VisualSwitcher v-else-if="exploration"/></div>
    <App />
  </div>
</template>
<style>
.campus-marker-stack{position:sticky;top:0;z-index:100}
.campus-marker{background:#fff4d8;color:#59431b;padding:6px 20px;display:flex;align-items:center;gap:8px 20px;flex-wrap:wrap;font-size:13px;border-bottom:1px solid #e6d2a2}
.campus-marker button,.campus-marker summary{min-height:44px;display:flex;align-items:center;cursor:pointer}
.campus-marker button{background:white;border:1px solid #bfa66c;border-radius:8px;padding:0 12px;color:inherit}
.campus-marker details p{max-width:900px;line-height:1.8;margin:4px 0}
.campus-preview .mock-banner{display:none}
.campus-preview .workspace-sidebar{top:var(--campus-marker-height,80px);height:calc(100dvh - var(--campus-marker-height,80px))}
.campus-preview .workspace-topbar{top:var(--campus-marker-height,80px)}
@media(max-width:600px){.campus-marker{padding:8px 16px;gap:0 12px}.campus-marker>span{width:100%;order:1}.campus-marker details{order:2}.campus-marker button{margin-left:auto}}
</style>
