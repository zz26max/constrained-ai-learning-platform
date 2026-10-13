<script setup lang="ts">
</script>

<template>
  <section class="auth-panel panel" aria-labelledby="not-found-title">
    <h1 id="not-found-title" tabindex="-1">页面不存在</h1>
    <p class="auth-hint">地址无效或对象不可访问，请从有效入口重新选择。</p>
    <RouterLink class="button secondary" to="/login">前往登录</RouterLink>
  </section>
</template>
