<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'
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
import { useAuthStore } from '../../stores/auth'
import { assignmentStateLabel, assignmentTypeLabel, dueInfo, isUuid } from './format'
import { formatShortTime } from '../courses/format'
import { pageError } from '../courses/page-error'
import { retainWorkspace, takeWorkspace } from './workspace-recovery'
import { trackLearningEvent, EDITOR_FILES, type EditorFile } from '../analytics/reporter'
import { onTablistKeydown } from '../../components/tabs'
import WebPreview from './WebPreview.vue'
import TutoringPanel from '../tutoring/TutoringPanel.vue'

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
        <UiButton v-if="isWebLab" variant="secondary" @click="runPreview">运行</UiButton>
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
                  :value="fileContents[activeTab] ?? currentFile?.content ?? ''"
                  :disabled="!canSave || frozen || auth.phase !== 'authenticated'"
                  class="workspace-editor"
                  :aria-label="activeTab"
                  rows="20"
                  spellcheck="false"
                  @input="handleFileEdit(($event.target as HTMLTextAreaElement).value)"
                />
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
