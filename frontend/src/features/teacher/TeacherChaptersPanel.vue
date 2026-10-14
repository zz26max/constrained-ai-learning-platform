<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { coursesApi } from '../../api'
import type { components } from '../../api/generated/schema'
import ApiState from '../../components/ApiState.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useCourseActions } from '../courses/use-course-actions'

type TeacherChapterDetailDTO = components['schemas']['TeacherChapterDetailDTO']
type TeacherChapterSummaryDTO = components['schemas']['TeacherChapterSummaryDTO']
type ChapterWrite = components['schemas']['ChapterWrite']
type ChapterPatch = components['schemas']['ChapterPatch']
type ResourceDTO = components['schemas']['ResourceDTO']
type ResourceWrite = components['schemas']['ResourceWrite']
type ResourcePatch = components['schemas']['ResourcePatch']
type Catalog = { chapters: components['schemas']['TeacherChapterListDTO']; points: components['schemas']['KnowledgePointListDTO'] }
const props = defineProps<{ offeringId: string; readOnly: boolean }>()
const api = coursesApi()
const selectedId = ref('')
const chapterDialog = ref<HTMLDialogElement | null>(null)
const resourceDialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<HTMLDialogElement | null>(null)
const editingChapter = ref<TeacherChapterDetailDTO | null>(null)
const editingResource = ref<ResourceDTO | null>(null)
const confirmation = ref<{ kind: 'publish'; chapter: TeacherChapterDetailDTO } | { kind: 'resource'; resource: ResourceDTO } | null>(null)
const chapterForm = reactive({ number: 1, title: '', summary: '', isRequired: true })
const resourceForm = reactive({ title: '', content: '', order: 1, knowledgePointId: '' })
const { pending, error: actionError, message, run } = useCourseActions()
const { data, status, error, load } = usePageQuery<Catalog>(async signal => {
  const [chapters, points] = await Promise.all([api.listTeacherChapters(props.offeringId, { signal }), api.listKnowledgePoints(props.offeringId, { signal })])
  return { chapters: chapters.data, points: points.data }
})
const details = usePageQuery<TeacherChapterDetailDTO>(async signal => {
  if (!selectedId.value) throw new Error('请先选择章节。')
  const result = await api.getTeacherChapter(selectedId.value, { signal })
  if (result.data.offeringId !== props.offeringId) throw new Error('章节不属于当前教学班。')
  return result.data
})
const chapterData = details.data
const chapterStatus = details.status
const chapterError = details.error
const canWrite = computed(() => !props.readOnly && !pending.value && status.value === 'success')
const canWriteChapter = computed(() => canWrite.value && chapterStatus.value === 'success' && chapterData.value?.publicationState !== 'archived')
const chapterValid = computed(() => chapterForm.title.trim().length > 0 && Number.isInteger(chapterForm.number) && chapterForm.number >= 1 && chapterForm.number <= 2147483647)
const contentBytes = computed(() => new TextEncoder().encode(resourceForm.content).byteLength)
const resourceValid = computed(() => resourceForm.title.trim().length > 0 && Number.isInteger(resourceForm.order) && resourceForm.order >= 1 && resourceForm.order <= 2147483647 && contentBytes.value <= 65536 && (resourceForm.knowledgePointId === '' || availablePoints.value.some(point => point.id === resourceForm.knowledgePointId)))
const availablePoints = computed(() => data.value?.points.items.filter(point => point.chapterId === null || point.chapterId === selectedId.value) ?? [])

watch(() => props.offeringId, () => { selectedId.value = ''; closeDialogs(); void load() }, { immediate: true })
watch(data, catalog => {
  if (!catalog) return
  if (!catalog.chapters.items.some(chapter => chapter.id === selectedId.value)) selectedId.value = catalog.chapters.items[0]?.id ?? ''
})
watch(selectedId, () => { if (selectedId.value) void details.load() })

function closeDialogs(): void { chapterDialog.value?.close(); resourceDialog.value?.close(); confirmDialog.value?.close(); editingChapter.value = null; editingResource.value = null; confirmation.value = null }
function cancelWrite(event: Event): void { if (pending.value) event.preventDefault() }
function publicationLabel(state: string): string { return state === 'draft' ? '草稿' : state === 'published' ? '已发布' : state === 'archived' ? '已归档' : '状态不兼容' }

async function openChapterEditor(chapter: TeacherChapterDetailDTO | null = null): Promise<void> {
  if (!canWrite.value || (chapter && !canWriteChapter.value)) return
  editingChapter.value = chapter
  chapterForm.number = chapter?.number ?? Math.max(0, ...(data.value?.chapters.items.map(item => item.number) ?? [])) + 1
  chapterForm.title = chapter?.title ?? ''
  chapterForm.summary = chapter?.summary ?? ''
  chapterForm.isRequired = chapter?.isRequired ?? true
  await nextTick()
  chapterDialog.value?.showModal()
}
async function saveChapter(): Promise<void> {
  if (!canWrite.value || !chapterValid.value) return
  const owner = props.offeringId
  const editing = editingChapter.value
  if (editing?.publicationState === 'archived') return
  let result: TeacherChapterSummaryDTO | null
  if (editing) {
    const body: ChapterPatch = { title: chapterForm.title.trim(), summary: chapterForm.summary }
    if (editing.publicationState === 'draft') { body.number = chapterForm.number; body.isRequired = chapterForm.isRequired }
    result = await run(token => api.patchChapter(editing.id, body, { csrfToken: token }), '章节内容已保存。')
  } else {
    const body: ChapterWrite = { number: chapterForm.number, title: chapterForm.title.trim(), summary: chapterForm.summary, isRequired: chapterForm.isRequired }
    result = await run(token => api.createChapter(owner, body, { csrfToken: token }), '章节草稿已创建，发布后学生才可阅读。')
  }
  if (result === null || owner !== props.offeringId) return
  chapterDialog.value?.close()
  editingChapter.value = null
  const previous = selectedId.value
  selectedId.value = result.id
  await load()
  if (previous === selectedId.value) await details.load()
}
async function openResourceEditor(resource: ResourceDTO | null = null): Promise<void> {
  if (!canWriteChapter.value || (resource?.archived ?? false)) return
  editingResource.value = resource
  resourceForm.title = resource?.title ?? ''
  resourceForm.content = resource?.content ?? ''
  resourceForm.order = resource?.order ?? Math.max(0, ...(chapterData.value?.resources.map(item => item.order) ?? [])) + 1
  resourceForm.knowledgePointId = resource?.knowledgePointId ?? ''
  await nextTick()
  resourceDialog.value?.showModal()
}
async function saveResource(): Promise<void> {
  if (!canWriteChapter.value || !resourceValid.value || chapterData.value === null) return
  const owner = props.offeringId
  const chapterId = selectedId.value
  const editing = editingResource.value
  if (editing?.archived) return
  const common = { title: resourceForm.title.trim(), content: resourceForm.content, order: resourceForm.order }
  let result: ResourceDTO | null
  if (editing) {
    const body: ResourcePatch = { ...common }
    if ((resourceForm.knowledgePointId || null) !== editing.knowledgePointId) body.knowledgePointId = resourceForm.knowledgePointId || null
    result = await run(token => api.patchResource(editing.id, body, { csrfToken: token }), '资料已保存。')
  } else {
    const body: ResourceWrite = { ...common, type: 'markdown', url: null, knowledgePointId: resourceForm.knowledgePointId || null }
    result = await run(token => api.createResource(chapterId, body, { csrfToken: token }), '资料已创建。')
  }
  if (result === null || owner !== props.offeringId || chapterId !== selectedId.value) return
  resourceDialog.value?.close()
  editingResource.value = null
  await Promise.all([load(), details.load()])
}
async function confirmPublish(): Promise<void> {
  if (!canWriteChapter.value || chapterData.value?.publicationState !== 'draft') return
  confirmation.value = { kind: 'publish', chapter: chapterData.value }
  await nextTick()
  confirmDialog.value?.showModal()
}
async function confirmResourceArchive(resource: ResourceDTO): Promise<void> {
  if (!canWriteChapter.value || resource.archived) return
  confirmation.value = { kind: 'resource', resource }
  await nextTick()
  confirmDialog.value?.showModal()
}
async function confirmAction(): Promise<void> {
  if (!canWriteChapter.value || confirmation.value === null) return
  const owner = props.offeringId
  const chapterId = selectedId.value
  const action = confirmation.value
  const result = action.kind === 'publish'
    ? await run(token => api.publishChapter(action.chapter.id, { csrfToken: token }), '章节已发布。')
    : await run(token => api.archiveResource(action.resource.id, { csrfToken: token }), '资料已删除归档，历史证据保留。')
  if (result === null || owner !== props.offeringId || chapterId !== selectedId.value) return
  confirmDialog.value?.close()
  confirmation.value = null
  await Promise.all([load(), details.load()])
}
function resourcePointLabel(id: string | null): string {
  if (id === null) return '未关联知识点'
  return data.value?.points.items.find(point => point.id === id)?.title ?? '关联知识点不可用'
}
onBeforeUnmount(closeDialogs)
</script>

<template>
  <section aria-labelledby="teacher-chapters-title">
    <div class="teacher-section-heading"><h2 id="teacher-chapters-title">章节与资料</h2><button type="button" class="button primary" :disabled="!canWrite" @click="openChapterEditor()">创建章节草稿</button></div>
    <ApiState :status="status" :error="error" @retry="load" />
    <p v-if="message" class="notice notice-info" role="status">{{ message }}</p>
    <ApiState v-if="actionError" status="error" :error="actionError" />
    <template v-if="status === 'success' && data">
      <div v-if="!data.chapters.items.length" class="surface teacher-empty"><h3>暂无章节</h3><p>创建章节草稿，准备知识点与资料，再明确发布给学生。</p></div>
      <div v-else class="teacher-chapter-workspace">
        <ul class="surface teacher-chapter-list"><li v-for="chapter in data.chapters.items" :key="chapter.id"><button type="button" class="teacher-chapter-choice" :aria-current="selectedId === chapter.id ? 'true' : undefined" @click="selectedId = chapter.id"><span class="teacher-chapter-number">{{ chapter.number }}</span><div><h3>{{ chapter.title }}</h3><p>{{ chapter.isRequired ? '必修' : '选修' }} · {{ chapter.resourceCount }} 份资料</p></div><span class="tag" :class="chapter.publicationState === 'published' ? 'tag-on' : 'tag-off'">{{ publicationLabel(chapter.publicationState) }}</span></button></li></ul>
        <div class="teacher-chapter-content">
          <ApiState v-if="selectedId" :status="chapterStatus" :error="chapterError" @retry="details.load" />
          <template v-if="selectedId && chapterStatus === 'success' && chapterData">
            <section class="surface teacher-chapter-summary"><div class="teacher-section-heading"><div><span class="teacher-muted">第 {{ chapterData.number }} 章 · {{ chapterData.isRequired ? '必修' : '选修' }}</span><h3>{{ chapterData.title }}</h3></div><span class="tag" :class="chapterData.publicationState === 'published' ? 'tag-on' : 'tag-off'">{{ publicationLabel(chapterData.publicationState) }}</span></div><p class="teacher-text">{{ chapterData.summary }}</p><p v-if="chapterData.publicationState === 'published'" class="teacher-field-hint">已发布章节可以澄清标题和摘要；章节号与必修属性保持不变。</p><div class="teacher-inline-actions"><button type="button" class="button secondary" :disabled="!canWriteChapter" @click="openChapterEditor(chapterData)">编辑章节</button><button v-if="chapterData.publicationState === 'draft'" type="button" class="button primary" :disabled="!canWriteChapter" @click="confirmPublish">发布章节</button></div></section>
            <section aria-labelledby="teacher-resources-title"><div class="teacher-section-heading teacher-resource-heading"><h3 id="teacher-resources-title">章节资料</h3><button type="button" class="button secondary" :disabled="!canWriteChapter" @click="openResourceEditor()">创建资料</button></div><div v-if="!chapterData.resources.length" class="surface teacher-empty"><p>本章暂无资料。</p></div><ul v-else class="surface teacher-resource-list"><li v-for="resource in chapterData.resources" :key="resource.id"><div><h4>{{ resource.title }}</h4><p>{{ resourcePointLabel(resource.knowledgePointId) }} · 顺序 {{ resource.order }}</p><span v-if="resource.archived" class="tag tag-off">已删除归档</span><details class="teacher-resource-preview"><summary>查看资料正文</summary><pre>{{ resource.content }}</pre></details></div><div class="teacher-inline-actions"><button type="button" class="button secondary" :disabled="!canWriteChapter || resource.archived" :aria-label="`编辑资料：${resource.title}`" @click="openResourceEditor(resource)">编辑</button><button type="button" class="button secondary" :disabled="!canWriteChapter || resource.archived" :aria-label="`删除归档资料：${resource.title}`" @click="confirmResourceArchive(resource)">删除归档</button></div></li></ul></section>
          </template>
        </div>
      </div>
    </template>
    <dialog ref="chapterDialog" class="teacher-dialog" aria-labelledby="chapter-editor-title" @cancel="cancelWrite" @close="editingChapter = null">
      <div class="teacher-dialog-heading"><h2 id="chapter-editor-title">{{ editingChapter ? '编辑章节' : '创建章节草稿' }}</h2><button type="button" class="button secondary" :disabled="pending" @click="chapterDialog?.close()">关闭</button></div><form class="teacher-form" @submit.prevent="saveChapter"><fieldset :disabled="readOnly || pending"><legend>章节信息</legend><label for="chapter-number">章节号</label><input id="chapter-number" v-model.number="chapterForm.number" type="number" min="1" max="2147483647" step="1" required :disabled="editingChapter !== null && editingChapter.publicationState !== 'draft'" /><label for="chapter-title">标题</label><input id="chapter-title" v-model="chapterForm.title" required maxlength="200" /><label for="chapter-summary">摘要</label><textarea id="chapter-summary" v-model="chapterForm.summary" maxlength="8000" rows="6" /><label class="teacher-checkbox"><input v-model="chapterForm.isRequired" type="checkbox" :disabled="editingChapter !== null && editingChapter.publicationState !== 'draft'" />必修章节</label><p v-if="editingChapter?.publicationState === 'published'" class="teacher-field-hint">已发布：不能更改章节号与必修属性。</p><button type="submit" class="button primary" :disabled="!canWrite || !chapterValid">{{ pending ? '正在保存…' : editingChapter ? '保存章节' : '创建草稿' }}</button></fieldset><ApiState v-if="actionError" status="error" :error="actionError" /></form>
    </dialog>
    <dialog ref="resourceDialog" class="teacher-dialog teacher-resource-dialog" aria-labelledby="resource-editor-title" @cancel="cancelWrite" @close="editingResource = null">
      <div class="teacher-dialog-heading"><h2 id="resource-editor-title">{{ editingResource ? '编辑资料' : '创建资料' }}</h2><button type="button" class="button secondary" :disabled="pending" @click="resourceDialog?.close()">关闭</button></div><form class="teacher-form" @submit.prevent="saveResource"><fieldset :disabled="readOnly || pending"><legend>Markdown 资料</legend><label for="resource-title">标题</label><input id="resource-title" v-model="resourceForm.title" required maxlength="200" /><label for="resource-content">正文（Markdown）</label><textarea id="resource-content" v-model="resourceForm.content" rows="12" /><p class="teacher-field-hint" :class="{ 'teacher-field-error': contentBytes > 65536 }">{{ contentBytes }} / 65536 字节（UTF-8）</p><label for="resource-point">关联知识点</label><select id="resource-point" v-model="resourceForm.knowledgePointId"><option value="">不关联知识点</option><option v-for="point in availablePoints" :key="point.id" :value="point.id">{{ point.title }}</option></select><label for="resource-order">显示顺序</label><input id="resource-order" v-model.number="resourceForm.order" type="number" min="1" max="2147483647" step="1" required /><button type="submit" class="button primary" :disabled="!canWriteChapter || !resourceValid">{{ pending ? '正在保存…' : '保存资料' }}</button></fieldset><ApiState v-if="actionError" status="error" :error="actionError" /></form>
    </dialog>
    <dialog ref="confirmDialog" class="teacher-dialog teacher-confirm" aria-labelledby="chapter-confirm-title" @cancel="cancelWrite" @close="confirmation = null"><h2 id="chapter-confirm-title">{{ confirmation?.kind === 'publish' ? '发布章节' : '删除归档资料' }}</h2><p v-if="confirmation?.kind === 'publish'">发布“{{ confirmation.chapter.title }}”后，学生可以阅读本章。章节号和必修属性将固定，之后只能澄清标题与摘要。</p><p v-else-if="confirmation?.kind === 'resource'">删除归档“{{ confirmation.resource.title }}”后，资料不再作为当前内容使用，历史考核证据会保留。</p><ApiState v-if="actionError" status="error" :error="actionError" /><div class="teacher-dialog-actions"><button type="button" class="button secondary" :disabled="pending" @click="confirmDialog?.close()">取消</button><button type="button" class="button primary" :disabled="!canWriteChapter" @click="confirmAction">{{ pending ? '正在处理…' : '确认' }}</button></div></dialog>
  </section>
</template>
