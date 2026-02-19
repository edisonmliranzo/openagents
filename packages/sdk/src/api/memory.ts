import type { OpenAgentsClient } from '../client'
import type { MemoryEntry, MemoryFileDocument, MemoryFileSummary } from '@openagents/shared'

export interface UpdateMemoryFileDto {
  content: string
}

export function createMemoryApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<MemoryEntry[]>('/api/v1/memory'),

    syncFiles: () => client.post<{ ok: true }>('/api/v1/memory/files/sync'),

    listFiles: () => client.get<MemoryFileSummary[]>('/api/v1/memory/files'),

    readFile: (name: string) => client.get<MemoryFileDocument>(`/api/v1/memory/files/${encodeURIComponent(name)}`),

    writeFile: (name: string, dto: UpdateMemoryFileDto) =>
      client.put<MemoryFileDocument>(`/api/v1/memory/files/${encodeURIComponent(name)}`, dto),

    delete: (id: string) => client.delete<{ count: number }>(`/api/v1/memory/${id}`),
  }
}
