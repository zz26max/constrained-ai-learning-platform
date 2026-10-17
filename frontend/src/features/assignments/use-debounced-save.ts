import { onScopeDispose, ref } from 'vue'
import { ApiError, type ApiResult } from '../../api/client'
import type { WorkspaceDTO, WorkspaceWrite } from '../../api/assignments'

export function useDebouncedSave(
  saveOperation: (data: WorkspaceWrite, token: string) => Promise<ApiResult<WorkspaceDTO>>,
  getCsrfToken: () => Promise<string>,
  debounceMs = 1500,
  readOperation?: () => Promise<WorkspaceDTO>,
) {
  const state = ref({ saving: false, lastSavedRevision: 0, pendingSave: false,
    error: null as string | null, inflightBaseRevision: 0,
    localEditSeq: 0, lastSavedEditSeq: 0, paused: false, recovering: false,
    serverSnapshot: null as WorkspaceDTO | null })
  type Pending = { data: WorkspaceWrite; seq: number }
  let pending: Pending | null = null
  let sent: Pending | null = null
  let inflight: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let alive = true, generation = 0, conflicted = false
  const copy = (data: WorkspaceWrite): WorkspaceWrite => ({ ...data, files: data.files.map(f => ({ ...f })) })
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null }
  const same = (a: WorkspaceDTO, b: WorkspaceWrite) => a.activeFile === b.activeFile
    && a.files.length === b.files.length && a.files.every(f => b.files.some(g => f.path === g.path && f.content === g.content))

  async function drain(): Promise<void> {
    const owner = generation
    while (alive && owner === generation && pending && !state.value.paused) {
      const item = pending
      pending = null
      sent = item
      state.value.saving = true
      state.value.inflightBaseRevision = item.data.baseRevision
      try {
        const token = await getCsrfToken()
        if (!alive || owner !== generation || state.value.paused) return
        const result = await saveOperation(copy(item.data), token)
        if (!alive || owner !== generation) return
        state.value.lastSavedRevision = result.data.revision
        state.value.lastSavedEditSeq = item.seq
        state.value.error = null
        sent = null
        if (pending) (pending as Pending).data.baseRevision = result.data.revision
      } catch (error) {
        if (!alive || owner !== generation) return
        pending ??= item
        conflicted = error instanceof ApiError && error.code === 'WORKSPACE_CONFLICT'
        state.value.paused = true
        state.value.error = conflicted ? '工作区已被修改，本地内容已保留。请读取服务端版本并比较。'
          : error instanceof Error ? error.message : '保存失败，本地内容已保留。'
        if (error instanceof ApiError && error.requestId) state.value.error += `（${error.requestId}）`
      } finally {
        if (alive && owner === generation) {
          state.value.saving = false
          state.value.inflightBaseRevision = 0
          state.value.pendingSave = state.value.localEditSeq !== state.value.lastSavedEditSeq
        }
      }
    }
  }

  async function flush(): Promise<boolean> {
    clearTimer()
    if (!alive) return false
    if (!inflight && pending && !state.value.paused) {
      const task = drain()
      inflight = task
      try { await task } finally { if (inflight === task) inflight = null }
    } else if (inflight) await inflight
    return alive && !state.value.paused && !state.value.pendingSave && !state.value.error
  }

  function scheduleSave(data: WorkspaceWrite): void {
    if (!alive) return
    clearTimer()
    pending = { data: copy(data), seq: ++state.value.localEditSeq }
    state.value.pendingSave = true
    if (!inflight && !state.value.paused) timer = setTimeout(() => { void flush() }, debounceMs)
  }

  async function recover(): Promise<boolean> {
    if (!readOperation || state.value.recovering || state.value.saving) return false
    const owner = generation
    state.value.recovering = true
    try {
      const server = await readOperation()
      if (!alive || owner !== generation) return false
      state.value.serverSnapshot = server
      if (!server.canSave) { state.value.error = '工作区已只读，本地内容已保留。'; return false }
      if (conflicted) return false
      // 仅认领刚发送快照的下一版本；其他版本变化必须交给用户比较。
      if (sent && server.revision === sent.data.baseRevision + 1 && same(server, sent.data)) {
        state.value.lastSavedRevision = server.revision
        state.value.lastSavedEditSeq = sent.seq
        if (pending?.seq === sent.seq) pending = null
      } else if (!sent || server.revision !== sent.data.baseRevision) {
        conflicted = true
        state.value.paused = true
        state.value.error = '服务端内容发生变化，请比较后恢复或合并。'
        return false
      }
      if (pending) pending.data.baseRevision = server.revision
      sent = null
      state.value.paused = false
      state.value.error = null
      state.value.serverSnapshot = null
      state.value.pendingSave = state.value.localEditSeq !== state.value.lastSavedEditSeq
      return await flush()
    } catch (error) {
      if (alive && owner === generation) state.value.error = error instanceof Error ? error.message : '读取服务端失败，请重试。'
      return false
    } finally { if (alive && owner === generation) state.value.recovering = false }
  }

  function reset(revision = 0): void {
    generation++
    clearTimer()
    pending = null; sent = null; inflight = null; conflicted = false
    Object.assign(state.value, { saving: false, pendingSave: false, error: null, paused: false,
      recovering: false, serverSnapshot: null, inflightBaseRevision: 0,
      localEditSeq: 0, lastSavedEditSeq: 0, lastSavedRevision: revision })
  }

  async function resolveConflict(data: WorkspaceWrite): Promise<boolean> {
    const server = state.value.serverSnapshot
    if (!server?.canSave || state.value.saving || state.value.recovering) return false
    reset(server.revision)
    scheduleSave({ ...data, baseRevision: server.revision })
    return flush()
  }

  function pause(): void { clearTimer(); state.value.paused = true }
  function cancelPending(): void { reset(state.value.lastSavedRevision) }
  onScopeDispose(() => { alive = false; generation++; clearTimer() })
  return { state, scheduleSave, cancelPending, flush, recover, resolveConflict, reset, pause }
}
