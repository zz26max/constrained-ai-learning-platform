<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
import { pageError } from '../courses/page-error'
import { retainWorkspace, takeWorkspace } from './workspace-recovery'
import WebPreview from './WebPreview.vue'

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
let editingUserId = auth.identity?.id ?? ''
let loadGeneration = 0
const leaveDialog = ref<HTMLDialogElement | null>(null)
let leaveResolution: ((leave: boolean) => void) | null = null
const leaveBusy = ref(false)

const { state: saveState, scheduleSave, cancelPending, flush, recover, resolveConflict, reset, pause } = useDebouncedSave(
  async (data: WorkspaceWrite, token: string) => {
    if (auth.identity?.id !== editingUserId || auth.phase !== 'authenticated') throw new Error('请重新登录后恢复本地作品。')
    try { return await api.saveWorkspace(editingAssignmentId, data, { csrfToken: token }) }
    catch (error) { await pageError(error); throw error }
  },
  () => auth.ensureCsrfToken(),
  1500,
  async () => (await api.getWorkspace(editingAssignmentId)).data,
)

watch(() => route.params.id, async () => {
  const generation = ++loadGeneration
  const loadingId = assignmentId.value
  void assignmentQuery.load()
  await query.load()
  if (query.data.value && generation === loadGeneration && loadingId === assignmentId.value) {
    editingAssignmentId = loadingId
    editingUserId = auth.identity?.id ?? ''
    reset(query.data.value.revision)
    fileContents.value = {}
    for (const file of query.data.value.files) {
      fileContents.value[file.path] = file.content
    }
    activeTab.value = query.data.value.activeFile
    const retained = takeWorkspace(editingUserId, loadingId)
    if (retained) {
      fileContents.value = Object.fromEntries(retained.draft.files.map(f => [f.path, f.content]))
      activeTab.value = retained.draft.activeFile
      reflection.value = retained.reflection
      scheduleSave(retained.draft)
      pause()
      saveState.value.serverSnapshot = query.data.value
      saveState.value.error = '已恢复本账号的本地编辑，请比较服务端内容后明确恢复或合并。'
    }
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
const frozen = computed(() => submitting.value || actions.pending.value)

function currentDraft(): WorkspaceWrite {
  return { baseRevision: saveState.value.lastSavedRevision, activeFile: activeTab.value as WorkspaceWrite['activeFile'],
    files: Object.entries(fileContents.value).map(([path, content]) => ({ path: path as WorkspaceWrite['activeFile'], content })) }
}
watch(() => auth.identity?.id, id => {
  if (id === editingUserId) return
  if (!id && editingAssignmentId && (hasUnsavedEdits.value || reflection.value)) {
    retainWorkspace({ userId: editingUserId, assignmentId: editingAssignmentId, draft: currentDraft(), reflection: reflection.value })
  }
  pause()
  if (id) { cancelPending(); fileContents.value = {}; reflection.value = ''; void query.load() }
}, { flush: 'sync' })

function finishLeave(leave: boolean): void {
  if (leave) { cancelPending(); reflection.value = '' }
  leaveDialog.value?.close()
  leaveResolution?.(leave)
  leaveResolution = null
}
async function waitAndLeave(): Promise<void> {
  leaveBusy.value = true
  const saved = saveState.value.paused ? await recover() : await flush()
  leaveBusy.value = false
  if (saved && !reflection.value) finishLeave(true)
}
function restoreServer(): void {
  const server = saveState.value.serverSnapshot
  if (!server || saveState.value.recovering) return
  fileContents.value = Object.fromEntries(server.files.map(f => [f.path, f.content]))
  activeTab.value = server.activeFile
  reset(server.revision)
}

const canSubmit = computed(() => {
  return canSave.value && submissionEligible.value && !actions.pending.value
    && (saveState.value.lastSavedRevision > 0 || hasUnsavedEdits.value)
})

async function guardUnsavedEdits(to: RouteLocationNormalized): Promise<boolean> {
  // 会话失效的内存恢复由身份监听保留；主动退出由认证层清除。
  if (auth.phase !== 'authenticated' || to.name === 'login') {
    cancelPending()
    return true
  }
  if (frozen.value) return false
  if (!hasUnsavedEdits.value && !reflection.value) return true
  if (!reflection.value && await flush()) return true
  await nextTick()
  leaveDialog.value?.showModal()
  return new Promise(resolve => { leaveResolution = resolve })
}

onBeforeRouteLeave(to => guardUnsavedEdits(to))
onBeforeRouteUpdate((to, from) => to.params['id'] === from.params['id'] ? true : guardUnsavedEdits(to))

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedEdits.value && !reflection.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', warnBeforeUnload)

function handleFileEdit(content: string): void {
  if (!query.data.value || !canSave.value || frozen.value) return
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
  confirmSubmit.value = false
  submitFailure.value = null
  submitDialog.value?.showModal()
}

function closeSubmitDialog(): void {
  if (frozen.value) return
  submitDialog.value?.close()
  confirmSubmit.value = false
}

async function submitAssignment(): Promise<void> {
  if (!canSubmit.value || !confirmSubmit.value) return

  submitFailure.value = null
  submitting.value = true
  const frozenReflection = reflection.value
  const saved = await flush()
  if (!saved || saveState.value.lastSavedRevision <= 0) {
    submitting.value = false
    submitFailure.value = `最新修改未能保存，已停止提交。${saveState.value.error ?? ''}`
    return
  }

  const result = await actions.run(
    token => api.submitAssignment(assignmentId.value, {
      workspaceRevision: saveState.value.lastSavedRevision,
      reflection: frozenReflection
    }, { csrfToken: token }),
    '作业已提交成功'
  )

  submitting.value = false
  if (result) {
    reflection.value = ''
    closeSubmitDialog()
    await router.push({ name: 'student-assignment', params: { id: assignmentId.value } })
  }
}

onBeforeUnmount(() => {
  loadGeneration++
  leaveResolution?.(false)
  window.removeEventListener('beforeunload', warnBeforeUnload)
  cancelPending()
  closeSubmitDialog()
})
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-heading">
      <div>
        <h1 tabindex="-1">{{ assignmentQuery.data.value?.title ?? '工作区' }}</h1>
        <p>
          <RouterLink :to="{ name: 'student-assignment', params: { id: assignmentId } }">← 作业说明</RouterLink>
          <template v-if="query.data.value">
            <span aria-hidden="true"> · </span>
            <span role="status" aria-live="polite">
              <span v-if="saveState.error || saveState.paused">未保存 · 本地内容已保留</span>
              <span v-else-if="saveState.saving">正在保存...</span>
              <span v-else-if="saveState.pendingSave">等待保存...</span>
              <span v-else-if="saveState.lastSavedRevision > 0">已保存 · 版本 {{ saveState.lastSavedRevision }}</span>
              <span v-else>未保存</span>
            </span>
          </template>
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
    <button v-if="saveState.paused" type="button" class="button secondary" :disabled="saveState.recovering || saveState.saving || auth.phase !== 'authenticated'" @click="recover">读取服务端并恢复保存</button>
    <section v-if="saveState.serverSnapshot" class="surface" aria-label="比较工作区版本">
      <h2>服务端版本 {{ saveState.serverSnapshot.revision }}</h2>
      <p>本地作品保留在下方编辑器。比较后可编辑合并，再明确保存。</p>
      <div v-for="file in saveState.serverSnapshot.files" :key="file.path"><h3>{{ file.path }}</h3><pre>{{ file.content }}</pre></div>
      <button class="button secondary" type="button" :disabled="saveState.recovering" @click="restoreServer">放弃本地文件，恢复服务端版本</button>
      <button class="button" type="button" :disabled="!saveState.serverSnapshot.canSave || saveState.recovering" @click="resolveConflict(currentDraft())">确认保存编辑器中的合并结果</button>
    </section>

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
          :disabled="!canSave || frozen || auth.phase !== 'authenticated'"
          class="workspace-editor"
          rows="20"
          spellcheck="false"
          @input="handleFileEdit(($event.target as HTMLTextAreaElement).value)"
        />
      </section>
      <WebPreview v-if="assignmentQuery.data.value?.type === 'web_lab'" :key="editingAssignmentId" :files="fileContents" />
    </template>

    <dialog
      ref="submitDialog"
      class="teacher-dialog teacher-confirm"
      aria-labelledby="submit-title"
      @close="confirmSubmit = false"
      @cancel="frozen && $event.preventDefault()"
    >
      <h2 id="submit-title">提交作业</h2>
      <p>提交前将保存并确认最新编辑，教师收到的是此次确认的不可变版本。</p>
      <p class="teacher-muted">提交后仍可继续编辑，但本次提交版本不会改变。</p>

      <label for="reflection">完成反思（必填）：</label>
      <textarea
        id="reflection"
        v-model="reflection"
        rows="4"
        placeholder="简述你的实现思路、遇到的问题及解决方法..."
        :disabled="frozen"
      />

      <label class="teacher-checkbox">
        <input
          v-model="confirmSubmit"
          type="checkbox"
          :disabled="frozen"
        />
        我确认提交这个版本
      </label>

      <ActionNotice :error="actions.error.value" :message="null" />
      <p v-if="submitFailure" class="notice notice-error" role="alert">{{ submitFailure }}</p>

      <div class="teacher-dialog-actions">
        <button
          type="button"
          class="button secondary"
          :disabled="frozen"
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
    <dialog ref="leaveDialog" class="teacher-dialog" aria-labelledby="leave-title" @cancel.prevent="finishLeave(false)">
      <h2 id="leave-title">还有未保存的内容</h2>
      <p>可以等待文件保存、留在页面处理，或明确放弃本地修改。</p>
      <p v-if="reflection">反思只随正式提交保存。请留在页面完成提交，或明确放弃反思。</p>
      <p v-if="saveState.error" role="alert">{{ saveState.error }}</p>
      <button type="button" class="button" :disabled="leaveBusy" @click="waitAndLeave">等待保存</button>
      <button type="button" class="button secondary" :disabled="leaveBusy" @click="finishLeave(false)">留在页面</button>
      <button type="button" class="button secondary" :disabled="leaveBusy" @click="finishLeave(true)">放弃修改并离开</button>
    </dialog>
  </div>
</template>

<style scoped>
.workspace-editor {
  width: 100%;
  font-family: var(--font-mono);
  font-size: var(--fs-control);
  line-height: 1.6;
  padding: var(--space-4);
  border: 1px solid var(--line-control);
  border-radius: var(--radius-control);
  resize: vertical;
}

.workspace-editor:disabled {
  background-color: var(--canvas);
  cursor: not-allowed;
}
</style>
