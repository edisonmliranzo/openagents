import type { OpenAgentsClient } from '../client'

export interface KnowledgeGapRow {
  id: string
  userId: string
  topic: string
  label: string
  evidence: string
  count: number
  status: 'open' | 'studying' | 'studied'
  createdAt: string
  updatedAt: string
}

export function createStudyApi(client: OpenAgentsClient) {
  return {
    gaps: () => client.get<KnowledgeGapRow[]>('/api/v1/study/gaps'),
    run: () => client.post<{ ok: boolean; attempted: number; studied: number }>('/api/v1/study/run'),
  }
}
