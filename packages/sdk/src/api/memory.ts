import type { OpenAgentsClient } from '../client'
import type { MemoryEntry } from '@openagents/shared'

export function createMemoryApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<MemoryEntry[]>('/api/v1/memory'),

    delete: (id: string) => client.delete<{ count: number }>(`/api/v1/memory/${id}`),
  }
}
