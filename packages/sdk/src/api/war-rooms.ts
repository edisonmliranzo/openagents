import type { OpenAgentsClient } from '../client'

export interface WarRoomMessage {
  role: string
  agentName: string
  content: string
}

export interface WarRoom {
  id: string
  name: string
  userId: string
  status: 'active' | 'consensus_reached' | 'failed'
  agents: string[]
  transcript: WarRoomMessage[]
}

const BASE = '/api/v1/war-rooms'

export function createWarRoomsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<WarRoom[]>(BASE),
    get: (id: string) => client.get<WarRoom>(`${BASE}/${id}`),
    create: (input: { name: string; agents: string[] }) => client.post<WarRoom>(BASE, input),
    postMessage: (id: string, input: { agentName: string; content: string }) =>
      client.post<WarRoom | null>(`${BASE}/${id}/messages`, input),
    conclude: (id: string) => client.post<WarRoom | null>(`${BASE}/${id}/conclude`),
  }
}
