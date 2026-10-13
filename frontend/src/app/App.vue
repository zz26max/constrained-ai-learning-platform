<script setup lang="ts">
import { RouterView } from 'vue-router'
import { API_MODE } from './api-mode'

// 跳到主要内容：hash 路由下不能用 # 锚点，改为聚焦主区域。
function skipToMain(event: MouseEvent): void {
  event.preventDefault()
  document.getElementById('main-content')?.focus()
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#" @click.prevent="skipToMain">跳到主要内容</a>
    <!-- mock 模式常显标识（FRONTEND.md 1.1），不可关闭 -->
    <header v-if="API_MODE === 'mock'" class="mock-banner" role="status">
      模拟模式 · 全部数据为虚构，不访问真实接口
    </header>
    <main id="main-content" class="app-main" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
