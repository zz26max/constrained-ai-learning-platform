<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { defaultEntry } from './router'
const auth = useAuthStore()
</script>
<template><section class="workspace-page surface state-block"><h1 tabindex="-1">无权访问此入口</h1><p>当前身份不具备此入口所需的角色。教学班内的对象权限仍由服务器逐次确认。</p><RouterLink class="button secondary" :to="defaultEntry(auth.identity)">返回我的入口</RouterLink></section></template>
