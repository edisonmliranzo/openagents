import type { OpenAgentsClient } from '../client'

export interface WarRoomMessage {
  id: string
  role: 'agent' | 'user' | 'system'
  agentName: string | null
  content: string
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface ConsensusPair {
  a: string
  b: string
  similarity: number
}

export interface WarRoomConsensus {
  /** 0-100, higher means the contributions overlap more. */
  score: number
  label: 'consensus' | 'partial' | 'disagreement'
  pairs: ConsensusPair[]
  skipped: number
}

export interface WarRoomVerdict {
  winner: string
  confidence: number
  synthesis: string
  rationale: string
}

export interface WarRoom {
  id: string
  name: string
  topic: string | null
  status: 'active' | 'concluded' | 'failed'
  agents: string[]
  consensus: WarRoomConsensus | null
  verdict: WarRoomVerdict | null
  transcript: WarRoomMessage[]
  createdAt: string
  updatedAt: string
}

const BASE = '/api/v1/war-rooms'

export function createWarRoomsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<WarRoom[]>(BASE),

    get: (id: string) => client.get<WarRoom>(`${BASE}/${id}`),

    create: (input: { name: string; agents?: string[]; topic?: string }) =>
      client.post<WarRoom>(BASE, input),

    /** Runs a real multi-model debate and scores the consensus. */
    run: (id: string, input: { question?: string; models?: string[] } = {}) =>
      client.post<WarRoom>(`${BASE}/${id}/run`, input),

    postMessage: (id: string, input: { agentName: string; content: string; role?: 'agent' | 'user' | 'system' }) =>
      client.post<WarRoom | null>(`${BASE}/${id}/messages`, input),

    conclude: (id: string) => client.post<WarRoom | null>(`${BASE}/${id}/conclude`),

    remove: (id: string) => client.delete<{ ok: true }>(`${BASE}/${id}`),
  }
}
