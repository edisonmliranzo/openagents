import type { OpenAgentsClient } from '../client'
import type {
  Conversation,
  ConversationRepairReport,
  ConversationSearchResponse,
  Message,
} from '@openagents/shared'

export interface ConversationTreeNode {
  id: string
  title: string | null
  parentId: string | null
  fromMessageId: string | null
  messageCount: number
  createdAt: string
  lastMessageAt: string | null
  children: ConversationTreeNode[]
}

export interface ConversationTree {
  rootId: string
  currentId: string
  root: ConversationTreeNode | null
}

export function createConversationsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<Conversation[]>('/api/v1/conversations'),

    get: (id: string) => client.get<Conversation>(`/api/v1/conversations/${id}`),

    create: (title?: string) =>
      client.post<Conversation>('/api/v1/conversations', { title }),

    messages: (id: string) =>
      client.get<Message[]>(`/api/v1/conversations/${id}/messages`),

    sendMessage: (
      conversationId: string,
      content: string,
      onChunk: (chunk: string) => void,
      options?: { mode?: string; effort?: string },
    ) => {
      const body: Record<string, unknown> = { content }
      if (options?.mode) {
        body.mode = options.mode
      }
      if (options?.effort) {
        body.effort = options.effort
      }
      // client.stream takes (path, body, onChunk) - no options/signal support
      return client.stream(
        `/api/v1/conversations/${conversationId}/chat`,
        body,
        onChunk,
      )
    },

    inspectRepair: (id: string) =>
      client.get<ConversationRepairReport>(`/api/v1/conversations/${id}/repair`),

    repair: (id: string) =>
      client.post<ConversationRepairReport>(`/api/v1/conversations/${id}/repair`),

    search: (q: string, options?: { conversationId?: string; role?: string; limit?: number; offset?: number }) => {
      const params = new URLSearchParams({ q })
      if (options?.conversationId) params.set('conversationId', options.conversationId)
      if (options?.role) params.set('role', options.role)
      if (options?.limit) params.set('limit', String(options.limit))
      if (options?.offset) params.set('offset', String(options.offset))
      return client.get<ConversationSearchResponse>(`/api/v1/conversations/search?${params.toString()}`)
    },

    exportJsonl: (id: string) =>
      client.get<string[]>(`/api/v1/conversations/${id}/export/jsonl`),

    compress: (id: string) => client.post<{ ok: boolean; summary: string }>(`/api/v1/conversations/${id}/compress`),
    steer: (id: string, content: string) =>
      client.post<{ ok: boolean; queued: number }>(`/api/v1/conversations/${id}/steer`, { content }),
    truncate: (id: string, fromMessageId: string) =>
      client.post<{ ok: boolean; removed: number }>(`/api/v1/conversations/${id}/truncate`, { fromMessageId }),
    branch: (id: string, fromMessageId: string) =>
      client.post<{ conversation: Conversation; parentId: string; fromMessageId: string; copiedMessages: number }>(`/api/v1/conversations/${id}/branch`, { fromMessageId }),
    tree: (id: string) => client.get<ConversationTree>(`/api/v1/conversations/${id}/tree`),
    delete: (id: string) => client.delete<void>(`/api/v1/conversations/${id}`),
  }
}
