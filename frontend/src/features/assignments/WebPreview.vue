<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { buildWebPreview, previewMessage } from './web-preview'
import { trackLearningEvent } from '../analytics/reporter'
const props = withDefaults(defineProps<{ files: Record<string, string>; offeringId?: string; assignmentId?: string; showRun?: boolean }>(), { offeringId: undefined, assignmentId: undefined, showRun: true })
const frame = ref<HTMLIFrameElement | null>(null), source = ref(''), nonce = ref(''), message = ref('')
function preview(): void {
  nonce.value = crypto.randomUUID(); source.value = buildWebPreview(props.files, nonce.value); message.value = '正在加载预览…'
  if (props.offeringId !== undefined && props.assignmentId !== undefined) {
    trackLearningEvent({ type: 'preview_opened', offeringId: props.offeringId, assignmentId: props.assignmentId, viewport: 'desktop' })
  }
}
function reset(): void { source.value = ''; nonce.value = ''; message.value = '' }
function receive(event: MessageEvent): void {
  if (!source.value || event.source !== frame.value?.contentWindow) return
  const text = previewMessage(event.data, nonce.value)
  if (text !== null) message.value = text
}
window.addEventListener('message', receive)
onBeforeUnmount(() => { window.removeEventListener('message', receive); reset() })
defineExpose({ run: preview })
</script>
<template>
  <section class="preview" aria-label="Web 隔离预览">
    <div class="preview-bar">
      <span class="meta">运行结果 · 隔离预览，不代表自动检查</span>
      <span class="preview-actions">
        <button v-if="showRun" type="button" class="quiet-btn" @click="preview">{{ source ? '刷新' : '运行' }}</button>
        <button type="button" class="quiet-btn" :disabled="!source" @click="reset">重置</button>
      </span>
    </div>
    <p class="meta preview-status" role="status">{{ message || (source ? '' : '点「运行」后在隔离沙箱中加载 index.html，不访问网络。') }}</p>
    <iframe v-if="source" :key="nonce" ref="frame" title="学生作品隔离预览" sandbox="allow-scripts" referrerpolicy="no-referrer" :srcdoc="source" />
  </section>
</template>
<style scoped>iframe { width: 100%; min-height: 360px; border: 0; border-top: 1px solid var(--sr-line); background: #fff; }</style>
