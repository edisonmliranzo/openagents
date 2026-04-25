import type { OpenAgentsClient } from '../client'
import type { Conversation, ConversationRepairReport, Message } from '@openagents/shared'

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
      options?: { mode?: string },
    ) => {
      const body: Record<string, unknown> = { content }
      if (options?.mode) {
        body.mode = options.mode
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

    search: (q: string) =>
      client.get<Array<{ conversationId: string; conversationTitle: string | null; messageId: string; role: string; snippet: string; createdAt: string }>>(`/api/v1/conversations/search?q=${encodeURIComponent(q)}`),

    exportJsonl: (id: string) =>
      client.get<string[]>(`/api/v1/conversations/${id}/export/jsonl`),

    compress: (id: string) => client.post<{ ok: boolean; summary: string }>(`/api/v1/conversations/${id}/compress`),
    delete: (id: string) => client.delete<void>(`/api/v1/conversations/${id}`),
  }
}
