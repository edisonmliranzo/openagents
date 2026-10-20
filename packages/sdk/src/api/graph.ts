import type { OpenAgentsClient } from '../client'

export type GraphEntityType = 'person' | 'project' | 'company' | 'topic' | 'place'

export interface GraphNode {
  id: string
  name: string
  type: GraphEntityType
  summary: string
  mentionCount: number
  createdAt: string
  updatedAt: string
}

export interface GraphEdge {
  id: string
  fromId: string
  toId: string
  relation: string
  weight: number
}

export interface GraphMention {
  source: 'memory' | 'conversation' | 'briefing'
  sourceId: string
  snippet: string
  at: string
}

export interface GraphSnapshot {
  nodes: GraphNode[]
  edges: GraphEdge[]
  lastRunAt: string | null
  running: boolean
}

export interface GraphEntityDetail {
  entity: GraphNode & { mentions: GraphMention[] }
  relations: Array<GraphEdge & { direction: 'in' | 'out'; other: { id: string; name: string; type: GraphEntityType } | null }>
}

export function createGraphApi(client: OpenAgentsClient) {
  return {
    get: (q?: string) => client.get<GraphSnapshot>(`/api/v1/graph${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    entity: (id: string) => client.get<GraphEntityDetail>(`/api/v1/graph/entity/${encodeURIComponent(id)}`),
    rebuild: (full = false) =>
      client.post<{ ok: boolean; reason?: string; processed?: number; entities?: number; relations?: number }>(
        `/api/v1/graph/rebuild${full ? '?full=true' : ''}`,
      ),
  }
}
