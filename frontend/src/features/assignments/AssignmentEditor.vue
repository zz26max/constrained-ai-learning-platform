<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { assignmentsApi, coursesApi } from '../../api'
import type { AssignmentWriteDTO } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from './use-assignment-actions'
import { isUuid } from './format'
import { assignmentBody, localDateTime, templateFiles } from './assignment-form'
import TeacherSubmissionList from './TeacherSubmissionList.vue'
import TeacherAiPolicyPanel from '../tutoring/TeacherAiPolicyPanel.vue'

const route = useRoute()
const router = useRouter()
const api = assignmentsApi()
const actions = useAssignmentActions()
const courses = coursesApi()
const validation = ref<string | null>(null)

const assignmentId = computed(() => {
  const id = route.params.id
  return isUuid(id) ? id : null
})

const offeringId = computed(() => {
  const id = route.params.offeringId
  return isUuid(id) ? id : ''
})

const isNew = computed(() => assignmentId.value === null)
const ownerId = computed(() => isNew.value ? offeringId.value : query.data.value?.offeringId ?? '')
const published = computed(() => query.data.value?.publicationState === 'published')
const archived = computed(() => query.data.value?.publicationState === 'archived' || related.data.value?.offering.status === 'archived')
const locked = computed(() => archived.value || actions.pending.value || related.status.value !== 'success' || (!isNew.value && query.status.value !== 'success'))
const related = usePageQuery(async signal => {
  const [chapters, points, offering] = await Promise.all([courses.listTeacherChapters(ownerId.value, { signal }), courses.listKnowledgePoints(ownerId.value, { signal }), courses.getOffering(ownerId.value, { signal })])
  return { chapters: chapters.data.items, points: points.data.items, offering: offering.data }
})

const query = usePageQuery(async signal => {
  const id = assignmentId.value
  if (!id) return null
  const result = await api.getTeacherAssignment(id, { signal })
  return result.data
})
watch(ownerId, id => { if (id) void related.load() }, { immediate: true })

function emptyForm(): AssignmentWriteDTO { return {
  chapterId: null,
  title: '',
  type: 'web_lab',
  isRequired: true,
  description: '',
  requirements: [''],
  estimatedMinutes: 60,
  knowledgePointIds: [],
  dueAt: '',
  lateUntil: null,
  allowResubmit: false,
  maxAttempts: 1,
  maxScore: 100,
  rubric: [{ criterionId: 'c1', title: '完成度', description: '功能实现完整性', maxScore: 100 }],
  initialFiles: [
    { path: 'index.html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>作业</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <' + 'script src="script.js"><' + '/script>\n</body>\n</html>' },
    { path: 'style.css', content: '/* 样式 */\n' },
    { path: 'script.js', content: '// 代码\n' }
  ],
  aiPolicyVersion: null
} }
const form = ref<AssignmentWriteDTO>(emptyForm())
let loadGeneration = 0

watch(() => route.fullPath, async () => {
  const generation = ++loadGeneration
  validation.value = null
  if (isNew.value) { query.data.value = null; form.value = emptyForm(); return }
  if (!isNew.value) {
    await query.load()
    if (query.data.value && generation === loadGeneration) {
      form.value = {
        chapterId: query.data.value.chapterId,
        title: query.data.value.title,
        type: query.data.value.type,
        isRequired: query.data.value.isRequired,
        description: query.data.value.description,
        requirements: query.data.value.requirements,
        estimatedMinutes: query.data.value.estimatedMinutes,
        knowledgePointIds: query.data.value.knowledgePointIds,
        dueAt: localDateTime(query.data.value.dueAt),
        lateUntil: query.data.value.lateUntil ? localDateTime(query.data.value.lateUntil) : null,
        allowResubmit: query.data.value.allowResubmit,
        maxAttempts: query.data.value.maxAttempts,
        maxScore: query.data.value.maxScore,
        rubric: query.data.value.rubric,
        initialFiles: query.data.value.initialFiles,
        aiPolicyVersion: null
      }
    }
  }
}, { immediate: true })

async function save(): Promise<void> {
  if (locked.value) return
  validation.value = null
  let body
  try { body = assignmentBody(form.value, published.value) }
  catch { validation.value = '请填写有效的截止时间和延期时间。'; return }
  const result = isNew.value
    ? await actions.run(
        token => api.createAssignment(offeringId.value, body as AssignmentWriteDTO, { csrfToken: token }),
        '作业已创建'
      )
    : await actions.run(
        token => api.patchAssignment(assignmentId.value!, body, { csrfToken: token }),
        '作业已保存'
      )

  if (result) {
    await router.push({ name: 'teacher-assignment', params: { id: result.id } })
  }
}

function addRequirement(): void {
  form.value.requirements.push('')
}

function removeRequirement(index: number): void {
  form.value.requirements.splice(index, 1)
}
const pendingType = ref<AssignmentWriteDTO['type'] | null>(null)
function chooseType(event: Event): void {
  const select = event.target as HTMLSelectElement
  pendingType.value = select.value as AssignmentWriteDTO['type']
  select.value = form.value.type
}
function applyType(): void {
  if (!pendingType.value) return
  form.value.type = pendingType.value
  form.value.initialFiles = templateFiles(pendingType.value)
  pendingType.value = null
}
function changeChapter(): void { form.value.knowledgePointIds = [] }
function addCriterion(): void {
  form.value.rubric.push({ criterionId: crypto.randomUUID(), title: '', description: '', maxScore: 1 })
}
</script>

<template>
  <div class="workspace-page teacher-page assignment-editor-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">{{ isNew ? '创建作业' : '编辑作业' }}</h1>
        <p v-if="!isNew && query.data.value">
          {{ query.data.value.publicationState === 'draft' ? '草稿' : query.data.value.publicationState === 'published' ? '已发布' : '已归档' }}
        </p>
      </div>
      <button
        type="button"
        class="button"
        :disabled="locked || !form.title.trim()"
        @click="save"
      >
        {{ actions.pending.value ? '保存中...' : '保存' }}
      </button>
    </header>

    <ApiState v-if="!isNew" :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <ActionNotice :error="actions.error.value" :message="actions.message.value" />
    <p v-if="validation" class="notice notice-error" role="alert">{{ validation }}</p>
    <RouterLink v-if="ownerId" class="button secondary" :to="{ name: 'teacher-assignments', params: { offeringId: ownerId } }">返回作业管理</RouterLink>

    <fieldset class="surface" :disabled="locked">
      <header class="section-heading">
        <h2>基本信息</h2>
      </header>

      <label for="title">标题：</label>
      <input
        id="title"
        v-model="form.title"
        type="text"
        maxlength="200"
        required
        :disabled="published"
      />

      <label for="description">描述：</label>
      <textarea
        id="description"
        v-model="form.description"
        rows="4"
        maxlength="8000"
      />

      <fieldset :disabled="published">
      <label for="assignment-type">作业类型</label>
      <select id="assignment-type" :value="form.type" @change="chooseType"><option value="web_lab">Web 实验</option><option value="sql_text">SQL 作业</option><option value="text">文字作业</option></select>
      <div v-if="pendingType" role="alert"><p>切换类型将替换当前模板文件。已编辑的模板不会保留。</p><button type="button" class="button" @click="applyType">确认切换类型</button><button type="button" class="button secondary" @click="pendingType = null">保留当前类型</button></div>
      <ApiState :status="related.status.value" :error="related.error.value" @retry="related.load" />
      <label for="chapter">关联章节</label>
      <select id="chapter" v-model="form.chapterId" @change="changeChapter"><option :value="null">不关联章节</option><option v-for="chapter in related.data.value?.chapters" :key="chapter.id" :value="chapter.id">{{ chapter.number }} · {{ chapter.title }}</option></select>
      <fieldset><legend>关联知识点</legend><label v-for="point in related.data.value?.points.filter(p => p.chapterId === null || p.chapterId === form.chapterId)" :key="point.id"><input v-model="form.knowledgePointIds" type="checkbox" :value="point.id" />{{ point.title }}</label></fieldset>
      <label><input v-model="form.isRequired" type="checkbox" />必做作业</label>
      <label>要求：</label>
      <div v-for="(req, index) in form.requirements" :key="index" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
        <textarea
          v-model="form.requirements[index]"
          rows="2"
          maxlength="8000"
          style="flex: 1;"
        />
        <button
          v-if="form.requirements.length > 1"
          type="button"
          class="button secondary small"
          @click="removeRequirement(index)"
        >
          删除
        </button>
      </div>
      <button type="button" class="button secondary small" @click="addRequirement">
        添加要求
      </button>
      </fieldset>

      <label for="dueAt">截止时间：</label>
      <input
        id="dueAt"
        v-model="form.dueAt"
        type="datetime-local"
        step="1"
        required
      />
      <label for="lateUntil">延期截止时间（可选）</label><input id="lateUntil" v-model="form.lateUntil" type="datetime-local" step="1" />

      <fieldset :disabled="published">
      <label for="maxScore">满分：</label>
      <input
        id="maxScore"
        v-model.number="form.maxScore"
        type="number"
        min="0.01"
        max="9999.99"
        step="0.01"
        required
      />

      <label for="estimatedMinutes">预计时长（分钟）：</label>
      <input
        id="estimatedMinutes"
        v-model.number="form.estimatedMinutes"
        type="number"
        min="1"
        required
      />
      <label><input v-model="form.allowResubmit" type="checkbox" />允许重交</label>
      <label for="maxAttempts">最多提交次数</label><input id="maxAttempts" v-model.number="form.maxAttempts" type="number" min="1" />
      <h2>评分量规</h2>
      <p>各项分值之和须等于满分。保存时由服务端校验。</p>
      <fieldset v-for="(criterion, index) in form.rubric" :key="criterion.criterionId"><legend>评分项 {{ index + 1 }}</legend>
        <label>标题<input v-model="criterion.title" maxlength="200" /></label>
        <label>说明<textarea v-model="criterion.description" rows="2" /></label>
        <label>分值<input v-model.number="criterion.maxScore" type="number" min="0.01" step="0.01" /></label>
        <button v-if="form.rubric.length > 1" type="button" class="button secondary" @click="form.rubric.splice(index, 1)">删除评分项</button>
      </fieldset>
      <button type="button" class="button secondary" @click="addCriterion">添加评分项</button>
      <h2>初始模板</h2>
      <label v-for="file in form.initialFiles" :key="file.path">{{ file.path }}<textarea v-model="file.content" rows="8" spellcheck="false" /></label>
      </fieldset>
    </fieldset>
    <TeacherAiPolicyPanel v-if="assignmentId && published" :assignment-id="assignmentId" />
    <p v-else-if="assignmentId && !published && query.data.value?.publicationState === 'draft'" class="notice notice-info" role="note">AI 辅导政策在作业发布后配置。</p>
    <TeacherSubmissionList v-if="assignmentId && query.status.value === 'success' && query.data.value?.publicationState !== 'draft'" :assignment-id="assignmentId" />
  </div>
</template>
