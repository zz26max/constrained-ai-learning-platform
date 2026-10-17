import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { ApiError, TransportError } from '../src/api/client'
import type { WorkspaceDTO, WorkspaceWrite } from '../src/api/assignments'
import { useDebouncedSave } from '../src/features/assignments/use-debounced-save'
import { clearWorkspaceRecovery, retainWorkspace, takeWorkspace } from '../src/features/assignments/workspace-recovery'

const draft = (content: string, baseRevision = 1): WorkspaceWrite => ({ baseRevision, activeFile: 'answer.md', files: [{ path: 'answer.md', content }] })
const workspace = (content: string, revision = 1): WorkspaceDTO => ({ assignmentId: 'a', revision, activeFile: 'answer.md', files: draft(content).files, savedAt: null, canSave: true, saveBlockedReason: null })
const conflict = () => new ApiError({ status: 409, code: 'WORKSPACE_CONFLICT', message: '冲突', requestId: 'req-conflict' })

describe('保存恢复不丢作品', () => {
  it('切换用户或主动清除后不泄漏上一用户的作品和反思', () => {
    retainWorkspace({ userId: 'alice', assignmentId: 'a', draft: draft('private'), reflection: 'private reflection' })
    clearWorkspaceRecovery('bob')
    expect(takeWorkspace('alice', 'a')).toBeUndefined()
    retainWorkspace({ userId: 'alice', assignmentId: 'a', draft: draft('private'), reflection: 'private reflection' })
    clearWorkspaceRecovery()
    expect(takeWorkspace('alice', 'a')).toBeUndefined()
  })
  it('409 后继续编辑也不自动覆盖；明确合并后使用已比较版本保存', async () => {
    const scope = effectScope()
    const save = vi.fn().mockRejectedValueOnce(conflict()).mockImplementation(async (d: WorkspaceWrite) => ({ data: workspace(d.files[0]!.content, d.baseRevision + 1), requestId: null }))
    const read = vi.fn(async () => workspace('other tab', 2))
    const editor = scope.run(() => useDebouncedSave(save, async () => 'csrf', 1500, read))!
    editor.scheduleSave(draft('local'))
    expect(await editor.flush()).toBe(false)
    editor.scheduleSave(draft('local newer'))
    expect(await editor.flush()).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
    await editor.recover()
    expect(editor.state.value.serverSnapshot?.files[0]?.content).toBe('other tab')
    expect(await editor.resolveConflict(draft('merged', 2))).toBe(true)
    expect(save).toHaveBeenLastCalledWith(draft('merged', 2), 'csrf')
    scope.stop()
  })

  it('响应丢失但服务端已保存：读回确认，不重复写入', async () => {
    const scope = effectScope()
    const save = vi.fn().mockRejectedValue(new TransportError())
    const read = vi.fn(async () => workspace('latest', 2))
    const editor = scope.run(() => useDebouncedSave(save, async () => 'csrf', 1500, read))!
    editor.scheduleSave(draft('latest'))
    expect(await editor.flush()).toBe(false)
    expect(await editor.recover()).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(editor.state.value.pendingSave).toBe(false)
    expect(editor.state.value.lastSavedRevision).toBe(2)
    scope.stop()
  })

  it('恢复读回发现其他写入：保留本地并进入冲突，不覆盖', async () => {
    const scope = effectScope()
    const save = vi.fn().mockRejectedValue(new TransportError())
    const editor = scope.run(() => useDebouncedSave(save, async () => 'csrf', 1500, async () => workspace('someone else', 4)))!
    editor.scheduleSave(draft('mine'))
    await editor.flush()
    expect(await editor.recover()).toBe(false)
    expect(editor.state.value.paused).toBe(true)
    expect(editor.state.value.serverSnapshot?.revision).toBe(4)
    expect(save).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})
