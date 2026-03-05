import type { OpenAgentsClient } from '../client'
import type {
  BrowserCaptureInput,
  BrowserCaptureResult,
  MemoryEvent,
  MemoryFact,
  MemoryEntry,
  MemoryFileDocument,
  MemoryFileSummary,
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

    delete: (id: string) => client.delete<{ count: number }>(`/api/v1/memory/${id}`),
  }
}
