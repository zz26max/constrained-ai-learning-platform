<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'
import { assignmentsApi } from '../../api'
import type { WorkspaceWrite } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from './use-assignment-actions'
import { useDebouncedSave } from './use-debounced-save'
import { useAuthStore } from '../../stores/auth'
import { isUuid } from './format'

const route = useRoute()
const router = useRouter()
const api = assignmentsApi()
const auth = useAuthStore()
const actions = useAssignmentActions()

const assignmentId = computed(() => {
  const id = route.params.id
  return isUuid(id) ? id : ''
})

const query = usePageQuery(async signal => {
  const id = assignmentId.value
  if (!id) throw new Error('作业ID无效')
  const result = await api.getWorkspace(id, { signal })
  return result.data
})

// 正式提交资格以服务端 getAssignment 的 canSubmit 为准；工作区的 canSave 只管练习保存。
const assignmentQuery = usePageQuery(async signal => {
  const id = assignmentId.value
  if (!id) throw new Error('作业ID无效')
  return (await api.getAssignment(id, { signal })).data
})

const activeTab = ref<string>('index.html')
const fileContents = ref<Record<string, string>>({})
const submitDialog = ref<HTMLDialogElement | null>(null)
const reflection = ref('')
const confirmSubmit = ref(false)
const submitting = ref(false)
const submitFailure = ref<string | null>(null)

// 保存目标固定为已加载工作区的作业，不随路由参数变化，避免旧编辑写入新作业。
let editingAssignmentId = ''

const { state: saveState, scheduleSave, cancelPending, flush } = useDebouncedSave(
  async (data: WorkspaceWrite, token: string) => {
    return api.saveWorkspace(editingAssignmentId, data, { csrfToken: token, signal: new AbortController().signal })
  },
  () => auth.ensureCsrfToken()
)

watch(() => route.fullPath, async () => {
  const loadingId = assignmentId.value
  void assignmentQuery.load()
  await query.load()
  if (query.data.value) {
    editingAssignmentId = loadingId
    fileContents.value = {}
    for (const file of query.data.value.files) {
      fileContents.value[file.path] = file.content
    }
    activeTab.value = query.data.value.activeFile
    saveState.value.lastSavedRevision = query.data.value.revision
  }
}, { immediate: true })

const currentFile = computed(() => {
  return query.data.value?.files.find(f => f.path === activeTab.value)
})

const canSave = computed(() => {
  return query.data.value?.canSave ?? false
})

const submitBlockedLabels: Record<string, string> = {
  OFFERING_ARCHIVED: '教学班已归档',
  ASSIGNMENT_ARCHIVED: '作业已归档',
  RESUBMIT_AFTER_REVIEW: '已评价，不能再次提交',
  RESUBMIT_NOT_ALLOWED: '本作业不允许重新提交',
  ATTEMPT_LIMIT_REACHED: '提交次数已用完',
  SUBMISSION_CLOSED: '提交窗口已关闭',
}

const submissionEligible = computed(() => assignmentQuery.data.value?.canSubmit === true)
const submitBlockedText = computed(() => {
  const data = assignmentQuery.data.value
  if (!data || data.canSubmit !== false) return null
  return submitBlockedLabels[data.submissionBlockedReason ?? ''] ?? '当前不可提交'
})

const hasUnsavedEdits = computed(() =>
  saveState.value.pendingSave || saveState.value.saving || saveState.value.error !== null)

const canSubmit = computed(() => {
  return canSave.value && submissionEligible.value && !actions.pending.value
    && (saveState.value.lastSavedRevision > 0 || hasUnsavedEdits.value)
})

async function guardUnsavedEdits(to: RouteLocationNormalized): Promise<boolean> {
  // 退出登录或会话失效：丢弃待发送内容，不用失效会话继续写入。
  if (auth.phase !== 'authenticated' || to.name === 'login') {
    cancelPending()
    return true
  }
  if (!hasUnsavedEdits.value) return true
  if (await flush()) return true
  const leave = window.confirm('有修改尚未保存成功，离开将丢失这些修改。确定离开吗？')
  if (leave) cancelPending()
  return leave
}

onBeforeRouteLeave(to => guardUnsavedEdits(to))
onBeforeRouteUpdate((to, from) => to.params['id'] === from.params['id'] ? true : guardUnsavedEdits(to))

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedEdits.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', warnBeforeUnload)

function handleFileEdit(content: string): void {
  if (!query.data.value || !canSave.value) return
  fileContents.value[activeTab.value] = content

  const files = query.data.value.files.map(f => ({
    path: f.path,
    content: f.path === activeTab.value ? content : (fileContents.value[f.path] ?? f.content)
  }))

  const baseRevision = saveState.value.saving
    ? saveState.value.inflightBaseRevision
    : (saveState.value.lastSavedRevision > 0 ? saveState.value.lastSavedRevision : query.data.value.revision)

  scheduleSave({
    baseRevision,
    files,
    activeFile: activeTab.value as 'index.html' | 'style.css' | 'script.js' | 'answer.sql' | 'answer.md'
  })
}

function openSubmitDialog(): void {
  if (!canSubmit.value) return
  reflection.value = ''
  confirmSubmit.value = false
  submitFailure.value = null
  submitDialog.value?.showModal()
}

function closeSubmitDialog(): void {
  submitDialog.value?.close()
  reflection.value = ''
  confirmSubmit.value = false
}

async function submitAssignment(): Promise<void> {
  if (!canSubmit.value || !confirmSubmit.value) return

  submitFailure.value = null
  submitting.value = true
  const saved = await flush()
  submitting.value = false
  if (!saved || saveState.value.lastSavedRevision <= 0) {
    submitFailure.value = `最新修改未能保存，已停止提交。${saveState.value.error ?? ''}`
    return
  }

  const result = await actions.run(
    token => api.submitAssignment(assignmentId.value, {
      workspaceRevision: saveState.value.lastSavedRevision,
      reflection: reflection.value
    }, { csrfToken: token }),
    '作业已提交成功'
  )

  if (result) {
    closeSubmitDialog()
    await router.push({ name: 'student-assignment', params: { id: assignmentId.value } })
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  cancelPending()
  closeSubmitDialog()
})
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">工作区</h1>
        <p v-if="query.data.value">
          <span v-if="saveState.saving">正在保存...</span>
          <span v-else-if="saveState.pendingSave">等待保存...</span>
          <span v-else-if="saveState.lastSavedRevision > 0">已保存 · 版本 {{ saveState.lastSavedRevision }}</span>
          <span v-else>未保存</span>
        </p>
      </div>
      <button
        type="button"
        class="button"
        :disabled="!canSubmit"
        @click="openSubmitDialog"
      >
        提交作业
      </button>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <ApiState v-if="assignmentQuery.status.value === 'error'" :status="assignmentQuery.status.value" :error="assignmentQuery.error.value" @retry="assignmentQuery.load" />
    <ActionNotice :error="actions.error.value" :message="actions.message.value" />

    <p v-if="saveState.error" class="notice notice-error" role="alert">
      {{ saveState.error }}
    </p>

    <p v-if="canSave && submitBlockedText" class="notice notice-info" role="status">
      暂不能正式提交：{{ submitBlockedText }}。仍可保存练习内容。
    </p>

    <p v-if="query.data.value && !canSave" class="notice notice-info">
      {{ query.data.value.saveBlockedReason === 'OFFERING_ARCHIVED' ? '教学班已归档' : '作业已归档' }}，工作区为只读。
    </p>

    <template v-if="query.status.value === 'success' && query.data.value">
      <nav class="teacher-tabs" aria-label="文件切换">
        <button
          v-for="file in query.data.value.files"
          :key="file.path"
          type="button"
          :aria-current="activeTab === file.path ? 'page' : undefined"
          @click="activeTab = file.path"
        >
          {{ file.path }}
        </button>
      </nav>

      <section class="surface">
        <header class="section-heading">
          <h2>{{ activeTab }}</h2>
        </header>

        <textarea
          :value="fileContents[activeTab] ?? currentFile?.content ?? ''"
          :disabled="!canSave"
          class="workspace-editor"
          rows="20"
          spellcheck="false"
          @input="handleFileEdit(($event.target as HTMLTextAreaElement).value)"
        />
      </section>
    </template>

    <dialog
      ref="submitDialog"
      class="teacher-dialog teacher-confirm"
      aria-labelledby="submit-title"
      @close="confirmSubmit = false"
    >
      <h2 id="submit-title">提交作业</h2>
      <p>提交后教师将收到你的作业版本（版本 {{ saveState.lastSavedRevision }}）。</p>
      <p class="teacher-muted">提交后仍可继续编辑，但本次提交版本不会改变。</p>

      <label for="reflection">完成反思（必填）：</label>
      <textarea
        id="reflection"
        v-model="reflection"
        rows="4"
        placeholder="简述你的实现思路、遇到的问题及解决方法..."
        :disabled="actions.pending.value"
      />

      <label class="teacher-checkbox">
        <input
          v-model="confirmSubmit"
          type="checkbox"
          :disabled="actions.pending.value"
        />
        我确认提交这个版本
      </label>

      <ActionNotice :error="actions.error.value" :message="null" />
      <p v-if="submitFailure" class="notice notice-error" role="alert">{{ submitFailure }}</p>

      <div class="teacher-dialog-actions">
        <button
          type="button"
          class="button secondary"
          :disabled="actions.pending.value"
          @click="closeSubmitDialog"
        >
          取消
        </button>
        <button
          type="button"
          class="button primary"
          :disabled="actions.pending.value || submitting || !confirmSubmit || !reflection.trim()"
          @click="submitAssignment"
        >
          {{ submitting ? '正在保存最新修改...' : actions.pending.value ? '正在提交...' : '确认提交' }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.workspace-editor {
  width: 100%;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: vertical;
}

.workspace-editor:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}
</style>
