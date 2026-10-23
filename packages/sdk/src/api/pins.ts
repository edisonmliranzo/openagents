import type { OpenAgentsClient } from '../client'

export interface PinnedMessage {
  id: string
  messageId: string
  conversationId: string
  userId: string
  note?: string
  pinnedAt: string
  content?: string | null
  conversationTitle?: string | null
}

const BASE = '/api/v1/pins'

export function createPinsApi(client: OpenAgentsClient) {
  return {
    list: (limit = 50) => client.get<PinnedMessage[]>(`${BASE}/user?limit=${limit}`),

    listForConversation: (conversationId: string) =>
      client.get<PinnedMessage[]>(`${BASE}/conversation/${encodeURIComponent(conversationId)}`),

    pin: (input: { messageId: string; conversationId: string; note?: string }) =>
      client.post<PinnedMessage>(BASE, input),

    unpin: (id: string) => client.delete<boolean>(`${BASE}/${encodeURIComponent(id)}`),
  }
}
