<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'
import { API_MODE } from '../../app/api-mode'
import { assignmentsApi } from '../../api'
import type { WorkspaceWrite } from '../../api/assignments'
import ApiState from '../../components/ApiState.vue'
import ActionNotice from '../../components/ActionNotice.vue'
import SafeMarkdown from '../../components/SafeMarkdown.vue'
import UiButton from '../../components/ui/UiButton.vue'
import UiNotice from '../../components/ui/UiNotice.vue'
import { usePageQuery } from '../courses/use-page-query'
import { useAssignmentActions } from './use-assignment-actions'
import { useDebouncedSave } from './use-debounced-save'
import { useWorkspaceCheck } from './use-workspace-check'
import { useAuthStore } from '../../stores/auth'
import { assignmentStateLabel, assignmentTypeLabel, dueInfo, isUuid } from './format'
import { formatShortTime } from '../courses/format'
import { pageError } from '../courses/page-error'
import { retainWorkspace, takeWorkspace } from './workspace-recovery'
import { trackLearningEvent, EDITOR_FILES, type EditorFile } from '../analytics/reporter'
import { onTablistKeydown } from '../../components/tabs'
import WebPreview from './WebPreview.vue'
import TutoringPanel from '../tutoring/TutoringPanel.vue'
import { indent, newline, outdent, type TextEdit } from './editor-text'

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
const activeTabIndex = computed(() => query.data.value?.files.findIndex(f => f.path === activeTab.value) ?? -1)
function activateFileTab(index: number) {
  const file = query.data.value?.files[index]
  if (file) activeTab.value = file.path
}
// 学习事件：编辑器/预览打开（DEVELOPMENT §8.1）；activeFile 只在契约白名单内上报。
watch([() => assignmentQuery.data.value, activeTab], ([assignment, tab]) => {
  if (assignment === null || tab === null || !EDITOR_FILES.includes(tab as EditorFile)) return
  trackLearningEvent({ type: 'editor_opened', offeringId: assignment.offeringId, assignmentId: assignment.id, activeFile: tab as EditorFile })
}, { immediate: true })
const fileContents = ref<Record<string, string>>({})
const submitDialog = ref<HTMLDialogElement | null>(null)
const reflection = ref('')
const confirmSubmit = ref(false)
const submitting = ref(false)
const submitFailure = ref<string | null>(null)
const tutorOpen = ref(false)
const outputOpen = ref(false)
const problemVisible = ref(true)
const previewRef = ref<{ run: () => void } | null>(null)
const outputRef = ref<HTMLElement | null>(null)
const editorRef = ref<HTMLTextAreaElement | null>(null)

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
  tutorOpen.value = false
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

const detail = computed(() => assignmentQuery.data.value)
const isWebLab = computed(() => detail.value?.type === 'web_lab')
const requirements = computed(() => detail.value?.requirements ?? [])
const rubric = computed(() => detail.value?.rubric ?? [])
const typeLabel = computed(() => assignmentTypeLabel(detail.value?.type))
const stateLabel = computed(() => assignmentStateLabel(detail.value?.assignmentState ?? 'NOT_STARTED'))
const due = computed(() => dueInfo(detail.value?.dueAt, detail.value?.overdue ?? false))
const lateText = computed(() => detail.value?.lateUntil ? formatShortTime(detail.value.lateUntil) : '不接受补交')
const attemptsText = computed(() => {
  const data = detail.value
  if (typeof data?.attemptsUsed !== 'number' || typeof data?.maxAttempts !== 'number') return ''
  return `${data.attemptsUsed}/${data.maxAttempts}${data.allowResubmit ? ' · 批阅前可重交' : ''}`
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
const canRunChecks = computed(() => auth.config?.features.serverChecks === true)
const check = useWorkspaceCheck(
  () => assignmentId.value,
  () => query.status.value === 'success' && query.data.value?.assignmentId === assignmentId.value
    ? query.data.value.revision : null,
  () => API_MODE === 'real'
    && assignmentQuery.status.value === 'success' && detail.value?.id === assignmentId.value
    && (detail.value?.type === 'web_lab' || detail.value?.type === 'sql_text'),
)
const frozen = computed(() => submitting.value || actions.pending.value || check.preparing.value)
// 持久只读用 readonly：文字仍可选中复制（归档后学生要能取回自己的作品）。
// disabled 只留给提交、检查进行中的瞬时冻结。
const readOnly = computed(() => !canSave.value || auth.phase !== 'authenticated')
const checkIsStale = computed(() => check.checkedRevision.value !== null
  && (hasUnsavedEdits.value || check.checkedRevision.value !== saveState.value.lastSavedRevision))

function startCheck(): void {
  if (!canRunChecks.value || !canSave.value || frozen.value || saveState.value.paused) return
  void check.start(async () => {
    const version = saveState.value.lastSavedRevision
    const retryFailedVersion = check.status.value === 'error' && check.checkedRevision.value === version
    if ((version === 0 || retryFailedVersion) && !hasUnsavedEdits.value) {
      scheduleSave(currentDraft())
    }
    if (!await flush() || saveState.value.lastSavedRevision <= 0) {
      throw new Error('最新作品未能保存，请恢复保存后再运行自动检查。')
    }
    return saveState.value.lastSavedRevision
  })
}

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
  return canSave.value && submissionEligible.value && !frozen.value
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

/** 把纯文本操作写回工作区，等 `:value` 应用到 DOM 后再恢复光标与选区。 */
function applyEdit(edit: TextEdit): void {
  handleFileEdit(edit.value)
  void nextTick(() => {
    const element = editorRef.value
    if (!element) return
    element.selectionStart = Math.min(edit.start, element.value.length)
    element.selectionEnd = Math.min(edit.end, element.value.length)
  })
}

// Tab 会被编辑器吃掉，所以沿用主流编辑器的「Esc 后再按 Tab 才移出焦点」约定，保住键盘可达性。
let tabEscape = false

function onEditorKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  if (event.key === 'Escape') { tabEscape = true; return }
  const modified = event.ctrlKey || event.metaKey
  if (modified && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (!saveState.value.paused && !frozen.value && auth.phase === 'authenticated') void flush()
    return
  }
  if (event.key === 'Tab') {
    if (tabEscape) { tabEscape = false; return }
    event.preventDefault()
    const element = editorRef.value
    if (!element || readOnly.value || frozen.value) return
    applyEdit(event.shiftKey
      ? outdent(element.value, element.selectionStart, element.selectionEnd)
      : indent(element.value, element.selectionStart, element.selectionEnd))
    return
  }
  tabEscape = false
  if (event.key !== 'Enter' || event.shiftKey || modified || event.altKey) return
  const element = editorRef.value
  if (!element || readOnly.value || frozen.value) return
  event.preventDefault()
  applyEdit(newline(element.value, element.selectionStart, element.selectionEnd))
}

/** 执行器的通用文案没有信息量（见 backend/check-runner/web-check.mjs），重复渲染只是噪音。 */
const GENERIC_CHECK_MESSAGES = new Set(['未通过，请检查对应结构、内容或样式。', '符合此项要求。'])

function itemDetail(message: string): string {
  return GENERIC_CHECK_MESSAGES.has(message) ? '' : message
}

function openSubmitDialog(): void {
  if (!canSubmit.value) return
  confirmSubmit.value = false
  submitFailure.value = null
  submitDialog.value?.showModal()
}

async function runPreview(): Promise<void> {
  outputOpen.value = true
  previewRef.value?.run()
  await nextTick()
  outputRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
}

function toggleTutor(): void {
  tutorOpen.value = !tutorOpen.value
}

function closeTutor(): void {
  tutorOpen.value = false
}

/** AI 求助前先把工作区落到服务端：后端按 revision 快照，提问才能带上最新代码。 */
async function prepareWorkspaceForAi(): Promise<number | null> {
  if (frozen.value) throw new Error('正在提交作业，请稍后再求助。')
  if (!canSave.value) throw new Error('当前工作区为只读，不能请求 AI 辅导。')
  if (saveState.value.paused) throw new Error('工作区有未处理的冲突或保存错误，请先恢复保存再求助。')
  if (hasUnsavedEdits.value) {
    const saved = await flush()
    if (!saved) throw new Error('最新修改尚未保存，暂不能请求 AI 辅导。')
  }
  return saveState.value.lastSavedRevision > 0 ? saveState.value.lastSavedRevision : null
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
  <div class="workspace-page sr-workspace">
    <header class="ws-head">
      <div class="grow">
        <p class="page-eyebrow"><RouterLink :to="{ name: 'student-assignment', params: { id: assignmentId } }">← 作业详情</RouterLink></p>
        <h1 class="page-title" tabindex="-1">{{ assignmentQuery.data.value?.title ?? '工作区' }}</h1>
      </div>
      <span v-if="query.data.value" class="save-st" role="status" aria-live="polite">
        <span v-if="saveState.error || saveState.paused">未保存</span>
        <span v-else-if="saveState.saving">保存中…</span>
        <span v-else-if="saveState.pendingSave">待保存</span>
        <span v-else-if="saveState.lastSavedRevision > 0">r{{ saveState.lastSavedRevision }}</span>
      </span>
      <div class="ws-head-actions">
        <UiButton
          variant="quiet"
          :aria-pressed="problemVisible"
          @click="problemVisible = !problemVisible"
          title="题目面板"
        >
          题目
        </UiButton>
        <UiButton v-if="isWebLab" variant="secondary" title="预览网页效果" @click="runPreview">运行</UiButton>
        <UiButton
          v-if="check.configured.value"
          variant="secondary"
          :disabled="!canRunChecks || !canSave || frozen || saveState.paused || check.running.value"
          @click="startCheck"
        >
          {{ check.preparing.value ? '准备检查…' : check.status.value === 'error' ? '重新检查' : '自动检查' }}
        </UiButton>
        <UiButton
          variant="quiet"
          :disabled="frozen"
          :aria-pressed="tutorOpen"
          aria-controls="workspace-tutor"
          @click="toggleTutor"
          title="AI 求助"
        >
          AI
        </UiButton>
        <UiButton
          variant="primary"
          :disabled="!canSubmit"
          @click="openSubmitDialog"
        >
          提交作业
        </UiButton>
      </div>
    </header>

    <ApiState :status="query.status.value" :error="query.error.value" @retry="query.load" />
    <ApiState v-if="assignmentQuery.status.value === 'error'" :status="assignmentQuery.status.value" :error="assignmentQuery.error.value" @retry="assignmentQuery.load" />
    <ActionNotice :error="actions.error.value" :message="actions.message.value" />

    <UiNotice v-if="saveState.error" tone="error">
      {{ saveState.error }}
    </UiNotice>
    <UiButton v-if="saveState.paused" variant="secondary" :disabled="saveState.recovering || saveState.saving || auth.phase !== 'authenticated'" @click="recover">读取服务端并恢复保存</UiButton>
    <section v-if="saveState.serverSnapshot" class="conflict" aria-label="比较工作区版本">
      <h2>服务端版本 r{{ saveState.serverSnapshot.revision }}</h2>
      <p class="meta">本地作品保留在下方编辑器。比较后可编辑合并，再明确保存。</p>
      <details v-for="file in saveState.serverSnapshot.files" :key="file.path" class="snap-file">
        <summary><code>{{ file.path }}</code></summary>
        <pre>{{ file.content }}</pre>
      </details>
      <div class="conflict-actions">
        <UiButton :disabled="!saveState.serverSnapshot.canSave || saveState.recovering" @click="resolveConflict(currentDraft())">确认保存编辑器中的合并结果</UiButton>
        <UiButton variant="secondary" :disabled="saveState.recovering" @click="restoreServer">放弃本地文件，恢复服务端版本</UiButton>
      </div>
    </section>

    <UiNotice v-if="canSave && submitBlockedText" tone="info" role="status">
      暂不能正式提交：{{ submitBlockedText }}。仍可保存练习内容。
    </UiNotice>

    <UiNotice v-if="query.data.value && !canSave" tone="info">
      {{ query.data.value.saveBlockedReason === 'OFFERING_ARCHIVED' ? '教学班已归档' : '作业已归档' }}，工作区为只读。
    </UiNotice>

    <template v-if="query.status.value === 'success' && query.data.value">
      <div class="ws-ide-grid">
        <Transition name="ws-problem">
          <aside v-if="problemVisible" class="ws-problem" aria-label="题目与要求">
            <div class="ws-prob-compact">
              <span v-if="due.hasDue" class="ws-prob-due" :data-tone="due.overdue ? 'late' : ''">{{ due.relative }}</span>
              <span v-if="attemptsText" class="ws-prob-attempts">{{ attemptsText }}</span>
            </div>

            <section class="ws-prob-block">
              <SafeMarkdown v-if="detail?.description" :content="detail.description" />
              <p v-else class="meta">按下面的要求完成作答。</p>
            </section>

            <section v-if="requirements.length" class="ws-prob-block">
              <h3 class="ws-prob-section-title">要求</h3>
              <ol class="ws-req"><li v-for="(req, index) in requirements" :key="index"><SafeMarkdown :content="req" /></li></ol>
            </section>

            <section v-if="rubric.length" class="ws-prob-block">
              <h3 class="ws-prob-section-title">评分标准</h3>
              <table class="ws-rubric">
                <thead><tr><th>评分项</th><th class="r">分值</th></tr></thead>
                <tbody><tr v-for="criterion in rubric" :key="criterion.criterionId"><td>{{ criterion.title }}<span v-if="criterion.description" class="crit-desc">{{ criterion.description }}</span></td><td class="r num">{{ criterion.maxScore }}</td></tr></tbody>
              </table>
            </section>

            <RouterLink class="ws-prob-link" :to="{ name: 'student-assignment', params: { id: assignmentId } }">提交记录与评价 →</RouterLink>
          </aside>
        </Transition>

        <section class="ws-work" aria-label="作答区">
          <div class="ws-work-inner">
            <div class="ws-editor-col">
              <div class="file-tabs" role="tablist" aria-label="文件切换">
                <button
                  v-for="(file, index) in query.data.value.files"
                  :id="`workspace-file-tab-${index}`"
                  :key="file.path"
                  type="button"
                  role="tab"
                  class="file-tab"
                  :aria-selected="activeTab === file.path"
                  :tabindex="activeTab === file.path ? 0 : -1"
                  @click="activeTab = file.path"
                  @keydown="onTablistKeydown($event, activateFileTab)"
                >
                  {{ file.path }}
                </button>
              </div>

              <section class="editor" role="tabpanel" :aria-labelledby="activeTabIndex >= 0 ? `workspace-file-tab-${activeTabIndex}` : undefined">
                <textarea
                  ref="editorRef"
                  :value="fileContents[activeTab] ?? currentFile?.content ?? ''"
                  :readonly="readOnly"
                  :disabled="frozen"
                  class="workspace-editor"
                  :aria-label="activeTab"
                  title="Tab 缩进，Shift+Tab 反缩进，Esc 后 Tab 可移出编辑器"
                  rows="20"
                  spellcheck="false"
                  @keydown="onEditorKeydown"
                  @input="handleFileEdit(($event.target as HTMLTextAreaElement).value)"
                />
              </section>

              <section v-if="check.configured.value !== null || check.error.value" class="ws-check" aria-label="自动检查结果">
                <h2>自动检查</h2>
                <p v-if="isWebLab && check.configured.value" class="meta">检查 HTML/CSS 静态结构与样式，不执行 JavaScript。</p>
                <p v-if="check.configured.value && !canRunChecks" class="meta">自动检查服务当前不可用。</p>
                <p v-if="check.checkedRevision.value !== null" class="meta">
                  检查版本 r{{ check.checkedRevision.value }}。{{ checkIsStale ? '工作区已有更新，此结果对应旧版本。' : '' }}
                </p>
                <ApiState v-if="check.error.value" status="error" :error="check.error.value" @retry="check.retry" />
                <p v-else-if="check.status.value === 'queued'" role="status">排队中…</p>
                <p v-else-if="check.status.value === 'running'" role="status">正在检查…</p>
                <UiNotice v-else-if="check.result.value?.error" tone="error" role="alert">
                  检查未完成。{{ check.result.value.error.message }}
                  <span v-if="canRunChecks && canSave">可重新检查当前作品。</span>
                </UiNotice>
                <template v-else-if="check.result.value?.result">
                  <p role="status">通过 {{ check.result.value.result.passed }} / {{ check.result.value.result.total }} 项。正式成绩以教师评价为准。</p>
                  <ol class="ws-check-items">
                    <li v-for="(item, index) in check.result.value.result.items" :key="item.ruleId" :data-status="item.status">
                      <span class="ws-check-no">第 {{ index + 1 }} 项</span>
                      <span class="ws-check-state">{{ item.status === 'pass' ? '通过' : '未通过' }}</span>
                      <span v-if="itemDetail(item.message)" class="ws-check-detail">{{ itemDetail(item.message) }}</span>
                    </li>
                  </ol>
                  <pre v-if="check.result.value.result.output">{{ check.result.value.result.output }}</pre>
                  <p v-if="check.result.value.result.truncated" class="meta">输出已截断。</p>
                </template>
                <p v-else-if="check.configured.value === false">此作业尚未配置自动检查。</p>
              </section>

              <Transition name="ws-output">
                <div v-if="isWebLab && outputOpen" ref="outputRef" class="ws-output">
                  <div class="ws-output-head">
                    <span class="meta">运行结果 · 隔离预览，不代表自动检查</span>
                    <button type="button" class="ws-output-close" @click="outputOpen = false" aria-label="关闭运行结果">关闭</button>
                  </div>
                  <WebPreview
                    ref="previewRef"
                    :key="editingAssignmentId"
                    :files="fileContents"
                    :offering-id="detail?.offeringId"
                    :assignment-id="editingAssignmentId"
                    :show-run="false"
                  />
                </div>
              </Transition>
            </div>

            <Transition name="ws-tutor-slide">
              <div v-if="tutorOpen" id="workspace-tutor" class="ws-tutor-inline">
                <div class="ws-tutor-inline-head">
                  <div>
                    <h3>AI 求助</h3>
                    <p class="meta">发送前自动保存，AI 看到的是当前工作区版本。</p>
                  </div>
                  <button type="button" class="ws-tutor-inline-close" aria-label="关闭 AI 求助" @click="closeTutor">关闭</button>
                </div>
                <div class="ws-tutor-inline-body">
                  <TutoringPanel
                    :assignment-id="assignmentId"
                    embedded
                    :prepare-workspace="prepareWorkspaceForAi"
                  />
                </div>
                <div class="ws-tutor-inline-foot">
                  <span class="meta">只给思路和排错提示，不给完整答案。</span>
                  <RouterLink :to="{ name: 'student-help-new', params: { id: assignmentId } }">问老师</RouterLink>
                </div>
              </div>
            </Transition>
          </div>
        </section>
      </div>
    </template>

    <dialog
      ref="submitDialog"
      class="teacher-dialog teacher-confirm"
      aria-labelledby="submit-title"
      @close="confirmSubmit = false"
      @cancel="frozen && $event.preventDefault()"
    >
      <h2 id="submit-title">提交作业</h2>
      <p>提交前会保存最新编辑，教师收到的是这一版不可变内容。</p>
      <p class="meta">提交后仍可继续编辑，但本次提交版本不变。</p>

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
      <UiNotice v-if="submitFailure" tone="error">{{ submitFailure }}</UiNotice>

      <div class="teacher-dialog-actions">
        <UiButton
          variant="secondary"
          :disabled="frozen"
          @click="closeSubmitDialog"
        >
          取消
        </UiButton>
        <UiButton
          variant="primary"
          :disabled="actions.pending.value || submitting || !confirmSubmit || !reflection.trim()"
          @click="submitAssignment"
        >
          {{ submitting ? '正在保存最新修改...' : actions.pending.value ? '正在提交...' : '确认提交' }}
        </UiButton>
      </div>
    </dialog>
    <dialog ref="leaveDialog" class="teacher-dialog" aria-labelledby="leave-title" @cancel.prevent="finishLeave(false)">
      <h2 id="leave-title">还有未保存的内容</h2>
      <p>可以等待文件保存、留在页面处理，或明确放弃本地修改。</p>
      <p v-if="reflection">反思只随正式提交保存。请留在页面完成提交，或明确放弃反思。</p>
      <p v-if="saveState.error" role="alert">{{ saveState.error }}</p>
      <UiButton :disabled="leaveBusy" @click="waitAndLeave">等待保存</UiButton>
      <UiButton variant="secondary" :disabled="leaveBusy" @click="finishLeave(false)">留在页面</UiButton>
      <UiButton variant="secondary" :disabled="leaveBusy" @click="finishLeave(true)">放弃修改并离开</UiButton>
    </dialog>
  </div>
</template>

<style scoped>
.ws-head-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ws-check {
  flex: 0 0 auto;
  max-height: 15rem;
  overflow: auto;
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  background: var(--surface);
  overflow-wrap: anywhere;
}
.ws-check h2 {
  margin: 0 0 4px;
  font-size: 14px;
}
.ws-check p {
  margin: 4px 0;
}
.ws-check-items {
  display: grid;
  gap: 4px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.ws-check-items li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  font-size: 13px;
}
.ws-check-no {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.ws-check-state {
  font-weight: 600;
}
.ws-check-items li[data-status='fail'] .ws-check-state {
  color: var(--red);
}
.ws-check-detail {
  color: var(--muted);
}
.ws-check pre {
  white-space: pre-wrap;
  max-height: 12rem;
  overflow: auto;
}
</style>
