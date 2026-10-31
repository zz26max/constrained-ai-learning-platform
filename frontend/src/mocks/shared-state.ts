import type { MemberDTO } from '../api/courses'

export const sharedMembers = new Map<string, MemberDTO[]>()

export function resetSharedMembers(): void {
  sharedMembers.clear()
}
