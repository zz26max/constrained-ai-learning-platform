import { onScopeDispose, ref } from 'vue'
import type { ApiResult } from '../../api/client'
import type { WorkspaceDTO, WorkspaceWrite } from '../../api/assignments'

export interface DebouncedSaveState {
  saving: boolean
  lastSavedRevision: number
  pendingSave: boolean
  error: string | null
  inflightBaseRevision: number
}

export function useDebouncedSave(
  saveOperation: (data: WorkspaceWrite, token: string) => Promise<ApiResult<WorkspaceDTO>>,
  getCsrfToken: () => Promise<string>,
  debounceMs = 1500
) {
  const state = ref<DebouncedSaveState>({
    saving: false,
    lastSavedRevision: 0,
    pendingSave: false,
    error: null,
    inflightBaseRevision: 0,
  })

  let timer: number | null = null
  let pendingData: WorkspaceWrite | null = null
  let inflightRequest: Promise<void> | null = null
  let alive = true

  onScopeDispose(() => {
    alive = false
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  })

  async function executeSave(data: WorkspaceWrite): Promise<void> {
    if (!alive) return
    state.value.saving = true
    state.value.error = null
    state.value.inflightBaseRevision = data.baseRevision

    try {
      const token = await getCsrfToken()
      if (!alive) return

      const result = await saveOperation(data, token)
      if (!alive) return

      state.value.lastSavedRevision = result.data.revision
      state.value.saving = false
      state.value.error = null

      if (pendingData !== null && alive) {
        const nextData = { ...pendingData, baseRevision: result.data.revision }
        pendingData = null
        inflightRequest = executeSave(nextData)
        await inflightRequest
      } else {
        inflightRequest = null
        state.value.pendingSave = false
        state.value.inflightBaseRevision = 0
      }
    } catch (error) {
      if (!alive) return
      state.value.saving = false
      state.value.pendingSave = false
      state.value.inflightBaseRevision = 0
      inflightRequest = null
      pendingData = null

      if (error && typeof error === 'object' && 'code' in error) {
        const apiError = error as { code: string; message: string }
        if (apiError.code === 'WORKSPACE_CONFLICT') {
          state.value.error = '工作区已被修改，请刷新后重试'
        } else {
          state.value.error = apiError.message || '保存失败'
        }
      } else {
        state.value.error = '保存失败，请重试'
      }
    }
  }

  function scheduleSave(data: WorkspaceWrite): void {
    if (!alive) return

    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }

    pendingData = data
    state.value.pendingSave = true
    if (inflightRequest !== null) return

    timer = window.setTimeout(() => {
      if (!alive) return
      timer = null
      const next = pendingData
      pendingData = null
      if (next !== null) inflightRequest = executeSave(next)
    }, debounceMs)
  }

  // 立即发出防抖中的最新内容并等待在途保存结束；返回 true 表示服务端已确认全部本地编辑。
  async function flush(): Promise<boolean> {
    if (!alive) return false
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
      const next = pendingData
      pendingData = null
      if (next !== null) inflightRequest = executeSave(next)
    }
    while (inflightRequest !== null && alive) await inflightRequest
    return alive && state.value.error === null && !state.value.pendingSave
  }

  function cancelPending(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    pendingData = null
    state.value.pendingSave = false
  }

  return {
    state,
    scheduleSave,
    cancelPending,
    flush,
  }
}
