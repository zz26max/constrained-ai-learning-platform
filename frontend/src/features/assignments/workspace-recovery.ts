import type { WorkspaceWrite } from '../../api/assignments'

export interface WorkspaceRecovery { userId: string; assignmentId: string; draft: WorkspaceWrite; reflection: string }
// 仅在当前应用内存中保留；不写 localStorage，也不跨账号恢复。
const entries = new Map<string, WorkspaceRecovery>()
export function retainWorkspace(value: WorkspaceRecovery): void {
  entries.set(value.assignmentId, { ...value, draft: { ...value.draft, files: value.draft.files.map(f => ({ ...f })) } })
}
export function takeWorkspace(userId: string, assignmentId: string): WorkspaceRecovery | undefined {
  const entry = entries.get(assignmentId)
  entries.delete(assignmentId)
  return entry?.userId === userId ? entry : undefined
}
export function clearWorkspaceRecovery(userId?: string): void {
  for (const [id, entry] of entries) if (userId === undefined || entry.userId !== userId) entries.delete(id)
}
