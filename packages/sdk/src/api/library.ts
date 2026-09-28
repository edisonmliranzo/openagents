import type { OpenAgentsClient } from '../client'

export interface LibraryDocumentRow {
  id: string
  title: string
  source: string
  mimeType: string
  status: string
  chunkCount: number
  updatedAt: string
}

export interface LibraryHit {
  documentId: string
  title: string
  text: string
  score: number
  ordinal: number
}

export function createLibraryApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<LibraryDocumentRow[]>('/api/v1/library'),
    add: (input: { title: string; content: string; source?: string; mimeType?: string }) =>
      client.post<LibraryDocumentRow>('/api/v1/library', input),
    search: (q: string, topK = 6) =>
      client.get<LibraryHit[]>(`/api/v1/library/search?q=${encodeURIComponent(q)}&topK=${topK}`),
    remove: (id: string) => client.delete<{ ok: true }>(`/api/v1/library/${id}`),
  }
}
