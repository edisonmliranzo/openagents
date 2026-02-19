import type { OpenAgentsClient } from '../client'
import type { Conversation, Message } from '@openagents/shared'

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

    delete: (id: string) => client.delete<void>(`/api/v1/conversations/${id}`),
  }
}
