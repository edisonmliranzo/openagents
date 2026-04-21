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
    ) =>
      client.stream(
        `/api/v1/conversations/${conversationId}/chat`,
        { content },
        onChunk,
      ),

    inspectRepair: (id: string) =>
      client.get<ConversationRepairReport>(`/api/v1/conversations/${id}/repair`),

    repair: (id: string) =>
      client.post<ConversationRepairReport>(`/api/v1/conversations/${id}/repair`),

    compress: (id: string) =>
      client.post<{ ok: boolean; summary: string }>(`/api/v1/conversations/${id}/compress`),

    search: (q: string) =>
      client.get<Array<{ conversationId: string; conversationTitle: string | null; messageId: string; role: string; snippet: string; createdAt: string }>>(`/api/v1/conversations/search?q=${encodeURIComponent(q)}`),

    exportJsonl: (id: string) =>
      client.get<string[]>(`/api/v1/conversations/${id}/export/jsonl`),

    delete: (id: string) => client.delete<void>(`/api/v1/conversations/${id}`),
  }
}
