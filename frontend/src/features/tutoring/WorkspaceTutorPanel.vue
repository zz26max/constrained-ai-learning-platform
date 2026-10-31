<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import TutoringPanel from './TutoringPanel.vue'

const props = defineProps<{
  assignmentId: string
  prepareWorkspace: () => Promise<number | null>
}>()
const emit = defineEmits<{ close: [] }>()
const root = ref<HTMLElement | null>(null)
onMounted(() => root.value?.focus())
</script>

<template>
  <aside
    ref="root"
    class="ws-tutor sr-tutoring"
    aria-label="AI 求助"
    tabindex="-1"
    @keydown.esc="emit('close')"
  >
    <header class="ws-tutor-head">
      <div>
        <h2>AI 求助</h2>
        <p class="meta">发送前自动保存，AI 看到的是当前工作区版本。</p>
      </div>
      <button type="button" class="ws-tutor-close" aria-label="关闭 AI 求助" @click="emit('close')">关闭</button>
    </header>
    <div class="ws-tutor-body">
      <TutoringPanel
        :assignment-id="props.assignmentId"
        embedded
        :prepare-workspace="props.prepareWorkspace"
      />
    </div>
    <footer class="ws-tutor-foot">
      <span class="meta">只给思路和排错提示，不给完整答案。</span>
      <RouterLink :to="{ name: 'student-help-new', params: { id: props.assignmentId } }">问老师</RouterLink>
    </footer>
  </aside>
</template>
