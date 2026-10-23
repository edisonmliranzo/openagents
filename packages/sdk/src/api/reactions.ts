import type { OpenAgentsClient } from '../client'

export interface MessageReaction {
  id: string
  messageId: string
  conversationId: string
  userId: string
  emoji: string
  createdAt: string
}

export interface ReactionCounts {
  counts: Record<string, number>
  /** The reactions the current user has already added. */
  mine: string[]
}

const BASE = '/api/v1/reactions'

export function createReactionsApi(client: OpenAgentsClient) {
  return {
    allowed: () => client.get<string[]>(`${BASE}/allowed`),

    listForMessage: (messageId: string) =>
      client.get<MessageReaction[]>(`${BASE}/message/${encodeURIComponent(messageId)}`),

    counts: (messageId: string) =>
      client.get<ReactionCounts>(`${BASE}/message/${encodeURIComponent(messageId)}/counts`),

    add: (input: { messageId: string; conversationId: string; emoji: string }) =>
      client.post<MessageReaction>(BASE, input),

    /** Adds the reaction if missing, removes it if present. */
    toggle: (input: { messageId: string; conversationId: string; emoji: string }) =>
      client.post<{ active: boolean; counts: Record<string, number> }>(`${BASE}/toggle`, input),

    remove: (id: string) => client.delete<boolean>(`${BASE}/${encodeURIComponent(id)}`),
  }
}
