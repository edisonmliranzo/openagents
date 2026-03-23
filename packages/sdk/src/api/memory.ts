import type { OpenAgentsClient } from '../client'
import type {
  BrowserCaptureInput,
  BrowserCaptureResult,
  CreateLocalKnowledgeSourceInput,
  LocalKnowledgeSource,
  LocalKnowledgeSyncResult,
  MemoryConflict,
  MemoryEvent,
  MemoryFact,
  MemoryEntry,
  MemoryFileDocument,
  MemoryFileSummary,
  MemoryReviewItem,
  NanobotMemoryCurationResult,
  QueryMemoryInput,
  QueryMemoryResult,
  UpsertMemoryFactInput,
  WriteMemoryEventInput,
} from '@openagents/shared'

export interface UpdateMemoryFileDto {
  content: string
}

export function createMemoryApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<MemoryEntry[]>('/api/v1/memory'),

    query: (input: QueryMemoryInput) =>
      client.post<QueryMemoryResult>('/api/v1/memory/query', input),

    writeEvent: (input: WriteMemoryEventInput) =>
      client.post<MemoryEvent>('/api/v1/memory/events', input),

    listFacts: (entity?: string, limit?: number) => {
      const qs = new URLSearchParams()
      if (entity) qs.set('entity', entity)
      if (typeof limit === 'number') qs.set('limit', String(limit))
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return client.get<MemoryFact[]>(`/api/v1/memory/facts${suffix}`)
    },

    upsertFact: (input: UpsertMemoryFactInput) =>
      client.post<MemoryFact>('/api/v1/memory/facts', input),

    syncFiles: () => client.post<{ ok: true }>('/api/v1/memory/files/sync'),

    listFiles: () => client.get<MemoryFileSummary[]>('/api/v1/memory/files'),

    readFile: (name: string) => client.get<MemoryFileDocument>(`/api/v1/memory/files/${encodeURIComponent(name)}`),

    writeFile: (name: string, dto: UpdateMemoryFileDto) =>
      client.put<MemoryFileDocument>(`/api/v1/memory/files/${encodeURIComponent(name)}`, dto),

    capture: (input: BrowserCaptureInput) =>
      client.post<BrowserCaptureResult>('/api/v1/memory/capture', input),

    curate: () =>
      client.post<NanobotMemoryCurationResult>('/api/v1/memory/curate'),

    listConflicts: (status?: 'open' | 'resolved' | 'ignored', limit?: number) => {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      if (typeof limit === 'number') qs.set('limit', String(limit))
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return client.get<MemoryConflict[]>(`/api/v1/memory/conflicts${suffix}`)
    },

    resolveConflict: (id: string, status: 'resolved' | 'ignored' = 'resolved') =>
      client.post<MemoryConflict>(`/api/v1/memory/conflicts/${encodeURIComponent(id)}/resolve`, { status }),

    reviewQueue: (limit?: number) => {
      const suffix = typeof limit === 'number' ? `?limit=${limit}` : ''
      return client.get<MemoryReviewItem[]>(`/api/v1/memory/review-queue${suffix}`)
    },

    listSources: () => client.get<LocalKnowledgeSource[]>('/api/v1/memory/sources'),

    createSource: (input: CreateLocalKnowledgeSourceInput) =>
      client.post<LocalKnowledgeSource>('/api/v1/memory/sources', input),

    syncSource: (id: string) =>
      client.post<LocalKnowledgeSyncResult>(`/api/v1/memory/sources/${encodeURIComponent(id)}/sync`),

    deleteSource: (id: string) =>
      client.delete<{ ok: true }>(`/api/v1/memory/sources/${encodeURIComponent(id)}`),

    delete: (id: string) => client.delete<{ count: number }>(`/api/v1/memory/${id}`),
  }
}
