<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { coursesApi } from '../../api'
import ApiState from '../../components/ApiState.vue'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import UiButton from '../../components/ui/UiButton.vue'
import { trackLearningEvent } from '../analytics/reporter'
import { resourceBody } from '../courses/format'
import { usePageQuery } from '../courses/use-page-query'

const props = defineProps<{
  resourceId: string
  title: string
  offeringId?: string | undefined
  canResumeEditing: boolean
}>()
const emit = defineEmits<{ close: [destination: 'tutoring' | 'editor'] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const heading = ref<HTMLHeadingElement | null>(null)
const titleId = useId()
const query = usePageQuery(async signal => {
  const { data } = await coursesApi().getResource(props.resourceId, { signal })
  if (data.id !== props.resourceId || (props.offeringId && data.offeringId !== props.offeringId)) {
    throw new Error('讲义与当前辅导引用不一致。')
  }
  return data
})
const resource = computed(() => query.status.value === 'success' ? query.data.value : null)

watch(resource, data => {
  if (data) trackLearningEvent({ type: 'resource_opened', offeringId: data.offeringId, resourceId: data.id })
})

onMounted(() => {
  dialog.value?.showModal()
  heading.value?.focus({ preventScroll: true })
  void query.load()
})

function finish(destination: 'tutoring' | 'editor'): void {
  if (!dialog.value?.open) return
  dialog.value.close()
  emit('close', destination)
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog ref="dialog" class="tutoring-resource-dialog" :aria-labelledby="titleId" @cancel.prevent="finish('tutoring')">
    <header class="resource-dialog-header">
      <div class="resource-dialog-title">
        <h2 :id="titleId" ref="heading" tabindex="-1">{{ resource?.title ?? title }}</h2>
      </div>
      <div class="resource-dialog-actions">
        <UiButton variant="secondary" @click="finish('tutoring')">返回辅导</UiButton>
        <UiButton v-if="canResumeEditing" variant="primary" @click="finish('editor')">继续编辑</UiButton>
      </div>
    </header>
    <div class="resource-dialog-content">
      <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
      <article v-if="resource">
        <SafeMarkdown :content="resourceBody(resource)" />
      </article>
    </div>
  </dialog>
</template>

<style scoped>
.tutoring-resource-dialog {
  box-sizing: border-box;
  width: min(52rem, calc(100% - 32px));
  height: min(42rem, calc(100dvh - 32px));
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  color: var(--ink);
  background: var(--surface);
  box-shadow: 0 16px 60px #111f3533;
}
.tutoring-resource-dialog[open] { display: flex; flex-direction: column; }
.tutoring-resource-dialog::backdrop { background: #111f3566; }
.resource-dialog-header {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--line);
}
.resource-dialog-title {
  flex: 1 1 16rem;
  min-width: 0;
}
.resource-dialog-title h2 {
  width: fit-content;
  margin: 0;
  font-size: 20px;
  overflow-wrap: anywhere;
}
.resource-dialog-title h2:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 4px;
  border-radius: 2px;
}
.resource-dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.resource-dialog-actions .button { min-height: 44px; }
.resource-dialog-content {
  flex: 1 1 auto;
  min-height: 0;
  padding: 14px 24px 24px;
  overflow: auto;
  overscroll-behavior: contain;
}
@media (max-width: 550px) {
  .tutoring-resource-dialog {
    width: calc(100% - 20px);
    height: calc(100dvh - 20px);
  }
  .resource-dialog-header { gap: 10px; padding: 12px 14px; }
  .resource-dialog-title h2 { font-size: 18px; }
  .resource-dialog-content { padding: 8px 14px 20px; }
  .resource-dialog-content :deep(pre) { white-space: pre-wrap; overflow-wrap: anywhere; }
}
</style>
