import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useDebouncedSave } from '../src/features/assignments/use-debounced-save'
import type { WorkspaceDTO, WorkspaceWrite } from '../src/api/assignments'
import type { ApiResult } from '../src/api/client'
import { ApiError } from '../src/api/client'

describe('工作区自动保存逻辑', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('防抖逻辑：1.5s 内多次调用只发一次保存', async () => {
    let saveCalls = 0
    const saveOperation = vi.fn(async (data: WorkspaceWrite, token: string): Promise<ApiResult<WorkspaceDTO>> => {
      saveCalls += 1
      return { data: { assignmentId: 'test', revision: saveCalls, files: data.files, activeFile: data.activeFile, savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null }, requestId: 'req-test' }
    })
    const getCsrfToken = vi.fn(async () => 'csrf-test')

    const { scheduleSave, state } = useDebouncedSave(saveOperation, getCsrfToken, 1500)

    scheduleSave({ files: [{ path: 'script.js', content: '// 1' }], activeFile: 'script.js', baseRevision: 0 })
    vi.advanceTimersByTime(500)
    scheduleSave({ files: [{ path: 'script.js', content: '// 2' }], activeFile: 'script.js', baseRevision: 0 })
    vi.advanceTimersByTime(500)
    scheduleSave({ files: [{ path: 'script.js', content: '// 3' }], activeFile: 'script.js', baseRevision: 0 })

    vi.advanceTimersByTime(1500)
    await vi.runAllTimersAsync()
    await nextTick()

    expect(saveCalls).toBe(1)
    expect(saveOperation).toHaveBeenCalledWith(
      expect.objectContaining({ files: [{ path: 'script.js', content: '// 3' }] }),
      'csrf-test'
    )
    expect(state.value.lastSavedRevision).toBe(1)
  })

  it('单次在途：保存进行时再编辑，等待完成后发下一次', async () => {
    let saveCalls = 0
    let resolveFirst!: (value: ApiResult<WorkspaceDTO>) => void
    const saveOperation = vi.fn(async (data: WorkspaceWrite, token: string): Promise<ApiResult<WorkspaceDTO>> => {
      saveCalls += 1
      if (saveCalls === 1) {
        return new Promise<ApiResult<WorkspaceDTO>>(resolve => { resolveFirst = resolve })
      }
      return { data: { assignmentId: 'test', revision: saveCalls, files: data.files, activeFile: data.activeFile, savedAt: '2026-10-14T03:00:00Z', canSave: true, saveBlockedReason: null }, requestId: 'req-test' }
    })
    const getCsrfToken = vi.fn(async () => 'csrf-test')

    const { scheduleSave, state } = useDebouncedSave(saveOperation, getCsrfToken, 1500)

    scheduleSave({ files: [{ path: 'script.js', content: '// 第一次' }], activeFile: 'script.js', baseRevision: 0 })
    vi.advanceTimersByTime(1500)
    await vi.runAllTimersAsync()
    await nextTick()

    expect(saveCalls).toBe(1)
    expect(state.value.saving).toBe(true)

    scheduleSave({ files: [{ path: 'script.js', content: '// 第二次' }], activeFile: 'script.js', baseRevision: 1 })
    vi.advanceTimersByTime(1500)
    await vi.runAllTimersAsync()
    await nextTick()

    expect(saveCalls).toBe(1)
    expect(state.value.pendingSave).toBe(true)

    resolveFirst({ data: { assignmentId: 'test', revision: 1, files: [{ path: 'script.js', content: '// 第一次' }], activeFile: 'script.js', savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null }, requestId: 'req-test' })
    await vi.runAllTimersAsync()
    await nextTick()

    expect(saveCalls).toBe(2)
    expect(state.value.saving).toBe(false)
    expect(state.value.pendingSave).toBe(false)
    expect(state.value.lastSavedRevision).toBe(2)
  })

  it('baseRevision 传递：每次保存使用上次返回的 revision', async () => {
    const saveOperation = vi.fn(async (data: WorkspaceWrite, token: string): Promise<ApiResult<WorkspaceDTO>> => {
      return { data: { assignmentId: 'test', revision: data.baseRevision + 1, files: data.files, activeFile: data.activeFile, savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null }, requestId: 'req-test' }
    })
    const getCsrfToken = vi.fn(async () => 'csrf-test')

    const { scheduleSave, state } = useDebouncedSave(saveOperation, getCsrfToken, 1500)

    scheduleSave({ files: [{ path: 'script.js', content: '// 1' }], activeFile: 'script.js', baseRevision: 0 })
    vi.advanceTimersByTime(1500)
    await vi.runAllTimersAsync()
    await nextTick()

    expect(saveOperation).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseRevision: 0 }),
      'csrf-test'
    )
    expect(state.value.lastSavedRevision).toBe(1)

    scheduleSave({ files: [{ path: 'script.js', content: '// 2' }], activeFile: 'script.js', baseRevision: 1 })
    vi.advanceTimersByTime(1500)
    await vi.runAllTimersAsync()
    await nextTick()

    expect(saveOperation).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseRevision: 1 }),
      'csrf-test'
    )
    expect(state.value.lastSavedRevision).toBe(2)
  })

  it('409 WORKSPACE_CONFLICT：显示错误并停止保存', async () => {
    const saveOperation = vi.fn(async () => {
      throw new ApiError({ status: 409, code: 'WORKSPACE_CONFLICT', message: '工作区已被修改', requestId: 'req-conflict' })
    })
    const getCsrfToken = vi.fn(async () => 'csrf-test')

    const { scheduleSave, state } = useDebouncedSave(saveOperation, getCsrfToken, 1500)

    scheduleSave({ files: [{ path: 'script.js', content: '// 冲突' }], activeFile: 'script.js', baseRevision: 0 })
    vi.advanceTimersByTime(1500)
    await vi.runAllTimersAsync()
    await nextTick()

    expect(state.value.saving).toBe(false)
    expect(state.value.error).toContain('工作区已被修改')
  })

  it('取消待发送：清除定时器和待发数据', async () => {
    const saveOperation = vi.fn(async (data: WorkspaceWrite, token: string): Promise<ApiResult<WorkspaceDTO>> => {
      return { data: { assignmentId: 'test', revision: 1, files: data.files, activeFile: data.activeFile, savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null }, requestId: 'req-test' }
    })
    const getCsrfToken = vi.fn(async () => 'csrf-test')

    const { scheduleSave, cancelPending, state } = useDebouncedSave(saveOperation, getCsrfToken, 1500)

    scheduleSave({ files: [{ path: 'script.js', content: '// 取消' }], activeFile: 'script.js', baseRevision: 0 })
    vi.advanceTimersByTime(500)

    cancelPending()

    vi.advanceTimersByTime(1500)
    await vi.runAllTimersAsync()
    await nextTick()

    expect(saveOperation).not.toHaveBeenCalled()
    expect(state.value.pendingSave).toBe(false)
  })

  it('flush：防抖期内立即发出最新内容，确认后返回 true（B1）', async () => {
    const saveOperation = vi.fn(async (data: WorkspaceWrite, token: string): Promise<ApiResult<WorkspaceDTO>> => {
      return { data: { assignmentId: 'test', revision: data.baseRevision + 1, files: data.files, activeFile: data.activeFile, savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null }, requestId: 'req-test' }
    })
    const { scheduleSave, flush, state } = useDebouncedSave(saveOperation, async () => 'csrf-test', 1500)

    scheduleSave({ files: [{ path: 'script.js', content: '// 最新' }], activeFile: 'script.js', baseRevision: 2 })
    vi.advanceTimersByTime(100)
    expect(saveOperation).not.toHaveBeenCalled()
    expect(state.value.pendingSave).toBe(true)

    const saved = await flush()

    expect(saved).toBe(true)
    expect(saveOperation).toHaveBeenCalledTimes(1)
    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({ baseRevision: 2, files: [{ path: 'script.js', content: '// 最新' }] }), 'csrf-test')
    expect(state.value.lastSavedRevision).toBe(3)
    expect(state.value.pendingSave).toBe(false)
  })

  it('flush：在途保存期间又有新编辑，等两次都确认后才返回 true', async () => {
    let resolveFirst!: (value: ApiResult<WorkspaceDTO>) => void
    let calls = 0
    const saveOperation = vi.fn(async (data: WorkspaceWrite, token: string): Promise<ApiResult<WorkspaceDTO>> => {
      calls += 1
      if (calls === 1) return new Promise<ApiResult<WorkspaceDTO>>(resolve => { resolveFirst = resolve })
      return { data: { assignmentId: 'test', revision: data.baseRevision + 1, files: data.files, activeFile: data.activeFile, savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null }, requestId: 'req-test' }
    })
    const { scheduleSave, flush, state } = useDebouncedSave(saveOperation, async () => 'csrf-test', 1500)

    scheduleSave({ files: [{ path: 'script.js', content: '// 第一次' }], activeFile: 'script.js', baseRevision: 0 })
    await vi.advanceTimersByTimeAsync(1500)
    scheduleSave({ files: [{ path: 'script.js', content: '// 第二次' }], activeFile: 'script.js', baseRevision: 0 })

    const flushing = flush()
    resolveFirst({ data: { assignmentId: 'test', revision: 1, files: [], activeFile: 'script.js', savedAt: '2026-10-14T02:00:00Z', canSave: true, saveBlockedReason: null }, requestId: 'req-test' })

    expect(await flushing).toBe(true)
    expect(saveOperation).toHaveBeenCalledTimes(2)
    expect(saveOperation).toHaveBeenLastCalledWith(expect.objectContaining({ baseRevision: 1, files: [{ path: 'script.js', content: '// 第二次' }] }), 'csrf-test')
    expect(state.value.lastSavedRevision).toBe(2)
  })

  it('flush：保存失败返回 false，不视为已确认', async () => {
    const saveOperation = vi.fn(async () => {
      throw new ApiError({ status: 409, code: 'WORKSPACE_CONFLICT', message: '工作区版本冲突', requestId: 'req-conflict' })
    })
    const { scheduleSave, flush, state } = useDebouncedSave(saveOperation, async () => 'csrf-test', 1500)

    scheduleSave({ files: [{ path: 'script.js', content: '// 冲突' }], activeFile: 'script.js', baseRevision: 0 })

    expect(await flush()).toBe(false)
    expect(state.value.error).not.toBeNull()
  })
})
