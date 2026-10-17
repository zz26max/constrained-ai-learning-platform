<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { buildWebPreview, previewMessage } from './web-preview'
const props = defineProps<{ files: Record<string, string> }>()
const frame = ref<HTMLIFrameElement | null>(null), source = ref(''), nonce = ref(''), message = ref('')
function preview(): void { nonce.value = crypto.randomUUID(); source.value = buildWebPreview(props.files, nonce.value); message.value = '正在加载预览…' }
function reset(): void { source.value = ''; nonce.value = ''; message.value = '' }
function receive(event: MessageEvent): void {
  if (!source.value || event.source !== frame.value?.contentWindow) return
  const text = previewMessage(event.data, nonce.value)
  if (text !== null) message.value = text
}
window.addEventListener('message', receive)
onBeforeUnmount(() => { window.removeEventListener('message', receive); reset() })
</script>
<template>
  <section class="surface" aria-label="Web 隔离预览">
    <h2>预览效果</h2>
    <p>预览当前编辑内容；不代表自动检查通过。仅支持本地三个文件，不加载外部包或网站。脚本卡住时可重置预览。</p>
    <button type="button" class="button" @click="preview">预览当前内容</button>
    <button type="button" class="button secondary" :disabled="!source" @click="reset">重置预览</button>
    <p role="status">{{ message }}</p>
    <iframe v-if="source" :key="nonce" ref="frame" title="学生作品隔离预览" sandbox="allow-scripts" referrerpolicy="no-referrer" :srcdoc="source" />
  </section>
</template>
<style scoped>iframe { width: 100%; min-height: 360px; border: 1px solid var(--border); background: white; }</style>
