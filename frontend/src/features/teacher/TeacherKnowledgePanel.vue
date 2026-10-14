<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { coursesApi } from '../../api'
import type { components } from '../../api/generated/schema'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useCourseActions } from '../courses/use-course-actions'

type KnowledgePointDTO = components['schemas']['KnowledgePointDTO']
type KnowledgePointWrite = components['schemas']['KnowledgePointWrite']
type KnowledgePointPatch = components['schemas']['KnowledgePointPatch']
type KnowledgeData = { points: components['schemas']['KnowledgePointListDTO']; chapters: components['schemas']['TeacherChapterListDTO'] }
const props = defineProps<{ offeringId: string; readOnly: boolean }>()
const api = coursesApi()
const dialog = ref<HTMLDialogElement | null>(null)
const editing = ref<KnowledgePointDTO | null>(null)
const form = reactive({ chapterId: '', title: '', description: '', order: 1 })
const { pending, error: actionError, message, run } = useCourseActions()
const { data, status, error, load } = usePageQuery<KnowledgeData>(async signal => {
  const [points, chapters] = await Promise.all([api.listKnowledgePoints(props.offeringId, { signal }), api.listTeacherChapters(props.offeringId, { signal })])
  return { points: points.data, chapters: chapters.data }
})
const canWrite = computed(() => !props.readOnly && !pending.value && status.value === 'success')
const valid = computed(() => form.title.trim().length > 0 && Number.isInteger(form.order) && form.order >= 1 && form.order <= 2147483647 && (form.chapterId === '' || data.value?.chapters.items.some(chapter => chapter.id === form.chapterId)))
watch(() => props.offeringId, () => { closeEditor(); void load() }, { immediate: true })

function chapterLabel(id: string | null): string {
  if (id === null) return '班级知识点'
  const chapter = data.value?.chapters.items.find(item => item.id === id)
  return chapter ? `第 ${chapter.number} 章 · ${chapter.title}` : '关联章节不可用'
}
async function openEditor(point: KnowledgePointDTO | null = null): Promise<void> {
  if (!canWrite.value) return
  editing.value = point
  form.chapterId = point?.chapterId ?? ''
  form.title = point?.title ?? ''
  form.description = point?.description ?? ''
  form.order = point?.order ?? 1
  await nextTick()
  dialog.value?.showModal()
}
function closeEditor(): void { dialog.value?.close(); editing.value = null }
function cancelEditor(event: Event): void { if (pending.value) event.preventDefault() }
async function save(): Promise<void> {
  if (!canWrite.value || !valid.value) return
  const owner = props.offeringId
  const point = editing.value
  const common = { title: form.title.trim(), description: form.description, order: form.order }
  let result: KnowledgePointDTO | null
  if (point) {
    const body: KnowledgePointPatch = { ...common }
    if ((form.chapterId || null) !== point.chapterId) body.chapterId = form.chapterId || null
    result = await run(token => api.patchKnowledgePoint(point.id, body, { csrfToken: token }), '知识点已保存。')
  } else {
    const body: KnowledgePointWrite = { ...common, chapterId: form.chapterId || null }
    result = await run(token => api.createKnowledgePoint(owner, body, { csrfToken: token }), '知识点已创建。')
  }
  if (result === null || owner !== props.offeringId) return
  closeEditor()
  await load()
}
onBeforeUnmount(closeEditor)
</script>

<template>
  <section aria-labelledby="teacher-knowledge-title">
    <div class="teacher-section-heading"><h2 id="teacher-knowledge-title">知识点</h2><button type="button" class="button primary" :disabled="!canWrite" @click="openEditor()">创建知识点</button></div>
    <ApiState :status="status" :error="error" @retry="load" />
    <p v-if="message" class="notice notice-info" role="status">{{ message }}</p>
    <ApiState v-if="actionError" status="error" :error="actionError" />
    <template v-if="status === 'success' && data">
      <div v-if="!data.points.items.length" class="surface teacher-empty"><h3>暂无知识点</h3><p>先创建班级或章节知识点，再把资料与知识点关联。</p></div>
      <ul v-else class="surface teacher-knowledge-list"><li v-for="point in data.points.items" :key="point.id"><span class="teacher-order">{{ point.order }}</span><div><h3>{{ point.title }}</h3><p>{{ point.description }}</p><small>{{ chapterLabel(point.chapterId) }}</small></div><button type="button" class="button secondary" :disabled="!canWrite" :aria-label="`编辑知识点：${point.title}`" @click="openEditor(point)">编辑</button></li></ul>
    </template>
    <dialog ref="dialog" class="teacher-dialog" aria-labelledby="knowledge-editor-title" @cancel="cancelEditor" @close="editing = null">
      <div class="teacher-dialog-heading"><h2 id="knowledge-editor-title">{{ editing ? '编辑知识点' : '创建知识点' }}</h2><button type="button" class="button secondary" :disabled="pending" @click="closeEditor">关闭</button></div>
      <form class="teacher-form" @submit.prevent="save">
        <fieldset :disabled="readOnly || pending">
          <legend>知识点内容</legend>
          <label for="knowledge-title">标题</label><input id="knowledge-title" v-model="form.title" required maxlength="200" />
          <label for="knowledge-description">说明</label><textarea id="knowledge-description" v-model="form.description" maxlength="8000" rows="5" />
          <label for="knowledge-chapter">关联章节</label><select id="knowledge-chapter" v-model="form.chapterId"><option value="">班级知识点（不绑定章节）</option><option v-for="chapter in data?.chapters.items" :key="chapter.id" :value="chapter.id">第 {{ chapter.number }} 章 · {{ chapter.title }}</option></select>
          <p class="teacher-field-hint">已有资源或作业引用时，服务端会限制章节关联变更；保存失败会保留当前输入。</p>
          <label for="knowledge-order">显示顺序</label><input id="knowledge-order" v-model.number="form.order" type="number" min="1" max="2147483647" step="1" required />
          <button type="submit" class="button primary" :disabled="!canWrite || !valid">{{ pending ? '正在保存…' : '保存知识点' }}</button>
        </fieldset>
        <ApiState v-if="actionError" status="error" :error="actionError" />
      </form>
    </dialog>
  </section>
</template>
