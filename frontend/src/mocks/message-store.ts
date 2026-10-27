import type { NotificationDTO } from '../api/assignments'
import { MOCK_STUDENT } from './envelope'
import { randomUUID } from './random'

export interface StoredMessage { dto: NotificationDTO; recipientId: string }

/** 通知、公告、反馈发布与求助回复共用的内存消息表。
    独立成无反向业务依赖的协作者，供 feedback / tutoring / dashboard 共同写入，
    避免 feedback 与 tutoring 互相导入（曾在 vitest 下引发初始化顺序问题）。 */
export const mockMessages: StoredMessage[] = []

export function addMockMessage(message: Omit<NotificationDTO, 'id' | 'readAt'>, recipientId: string = MOCK_STUDENT.id): NotificationDTO {
  const dto: NotificationDTO = { ...message, id: randomUUID(), readAt: null }
  mockMessages.push({ dto, recipientId })
  return dto
}
