<script setup lang="ts">
import { computed, Fragment, h } from 'vue'
import { renderSafeMarkdown } from '../features/courses/safe-markdown'

const props = defineProps<{ content: string }>()
const nodes = computed(() => renderSafeMarkdown(props.content))
const MarkdownContent = () => h(Fragment, null, nodes.value)
</script>

<template>
  <div class="safe-markdown"><MarkdownContent /></div>
</template>

<style scoped>
.safe-markdown { min-width: 0; line-height: 1.75; overflow-wrap: anywhere; }
.safe-markdown :deep(h2), .safe-markdown :deep(h3), .safe-markdown :deep(h4),
.safe-markdown :deep(h5), .safe-markdown :deep(h6) { line-height: 1.5; margin: 24px 0 10px; }
.safe-markdown :deep(h2) { font-size: 21px; }
.safe-markdown :deep(h3) { font-size: 18px; }
.safe-markdown :deep(h4), .safe-markdown :deep(h5), .safe-markdown :deep(h6) { font-size: 16px; }
.safe-markdown :deep(p) { margin: 12px 0; }
.safe-markdown :deep(a) { color: var(--blue-text); text-decoration: underline; text-underline-offset: 3px; }
.safe-markdown :deep(a:focus-visible), .safe-markdown :deep(.markdown-table-scroll:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 3px; }
.safe-markdown :deep(blockquote) { color: var(--muted); border-left: 3px solid var(--line); margin: 16px 0; padding: 1px 16px; }
.safe-markdown :deep(code) { font-family: Consolas, monospace; font-size: .9em; background: var(--canvas); padding: 2px 5px; border-radius: 3px; }
.safe-markdown :deep(pre) { overflow: auto; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-button); background: var(--canvas); }
.safe-markdown :deep(pre code) { padding: 0; background: none; border-radius: 0; }
.safe-markdown :deep(img) { display: block; max-width: 100%; height: auto; margin: 14px 0; }
.safe-markdown :deep(li) { margin: 5px 0; }
.safe-markdown :deep(li input) { margin-right: 8px; }
.safe-markdown :deep(hr) { border: 0; border-top: 1px solid var(--line); margin: 22px 0; }
.safe-markdown :deep(.markdown-table-scroll) { overflow-x: auto; margin: 16px 0; }
.safe-markdown :deep(table) { border-collapse: collapse; width: 100%; }
.safe-markdown :deep(th), .safe-markdown :deep(td) { padding: 9px 12px; border: 1px solid var(--line); text-align: left; min-width: 100px; }
.safe-markdown :deep(th) { background: var(--canvas); font-weight: 600; }
@media (max-width: 650px) {
  .safe-markdown { font-size: 14px; }
  .safe-markdown :deep(h2) { font-size: 19px; }
  .safe-markdown :deep(h3) { font-size: 17px; }
}
</style>
