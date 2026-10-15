<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { assignmentsApi } from '../../api'
import type { AssignmentWriteDTO } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from './use-assignment-actions'
import { isUuid } from './format'

const route = useRoute()
const router = useRouter()
const api = assignmentsApi()
const actions = useAssignmentActions()

const assignmentId = computed(() => {
  const id = route.params.id
  return isUuid(id) ? id : null
})

const offeringId = computed(() => {
  const id = route.params.offeringId
  return isUuid(id) ? id : ''
})

const isNew = computed(() => assignmentId.value === null)

const query = usePageQuery(async signal => {
  const id = assignmentId.value
  if (!id) return null
  const result = await api.getTeacherAssignment(id, { signal })
  return result.data
})

const form = ref<AssignmentWriteDTO>({
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
})

watch(() => route.fullPath, async () => {
  if (!isNew.value) {
    await query.load()
    if (query.data.value) {
      form.value = {
        chapterId: query.data.value.chapterId,
        title: query.data.value.title,
        type: query.data.value.type,
        isRequired: query.data.value.isRequired,
        description: query.data.value.description,
        requirements: query.data.value.requirements,
        estimatedMinutes: query.data.value.estimatedMinutes,
        knowledgePointIds: query.data.value.knowledgePointIds,
        dueAt: query.data.value.dueAt,
        lateUntil: query.data.value.lateUntil,
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
  const result = isNew.value
    ? await actions.run(
        token => api.createAssignment(offeringId.value, form.value, { csrfToken: token }),
        '作业已创建'
      )
    : await actions.run(
        token => api.patchAssignment(assignmentId.value!, form.value, { csrfToken: token }),
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
</script>

<template>
  <div class="workspace-page teacher-page">
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
        :disabled="actions.pending.value || !form.title.trim()"
        @click="save"
      >
        {{ actions.pending.value ? '保存中...' : '保存' }}
      </button>
    </header>

    <ApiState v-if="!isNew" :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <ActionNotice :error="actions.error.value" :message="actions.message.value" />

    <section class="surface">
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
      />

      <label for="description">描述：</label>
      <textarea
        id="description"
        v-model="form.description"
        rows="4"
        maxlength="8000"
      />

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

      <label for="dueAt">截止时间：</label>
      <input
        id="dueAt"
        v-model="form.dueAt"
        type="datetime-local"
        required
      />

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
    </section>
  </div>
</template>
