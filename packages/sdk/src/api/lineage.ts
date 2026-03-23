import type { OpenAgentsClient } from '../client'
import type { ConversationLineageGraph, DataLineageRecord } from '@openagents/shared'

export function createLineageApi(client: OpenAgentsClient) {
  return {
    recent: (limit = 60) =>
      client.get<DataLineageRecord[]>(`/api/v1/lineage/recent?limit=${encodeURIComponent(String(limit))}`),

    byConversation: (conversationId: string, limit = 60) =>
      client.get<DataLineageRecord[]>(
        `/api/v1/lineage/conversation/${encodeURIComponent(conversationId)}?limit=${encodeURIComponent(String(limit))}`,
      ),

    byMessage: (messageId: string) =>
      client.get<DataLineageRecord | null>(`/api/v1/lineage/message/${encodeURIComponent(messageId)}`),

    graph: (conversationId: string, limit = 80) =>
      client.get<ConversationLineageGraph>(
        `/api/v1/lineage/conversation/${encodeURIComponent(conversationId)}/graph?limit=${encodeURIComponent(String(limit))}`,
      ),
  }
}
