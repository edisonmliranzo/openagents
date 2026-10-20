import type { OpenAgentsClient } from '../client'

export interface PublicAgentRecord {
  id: string
  ownerId: string
  slug: string
  name: string
  avatar: string
  description: string
  greeting: string
  systemPrompt: string
  tools: string[]
  libraryDocumentIds: string[]
  published: boolean
  allowedOrigins: string[]
  dailyMessageCap: number
  monthlyCostCapUsd: number
  usage: {
    day: string
    messagesToday: number
    month: string
    costThisMonthUsd: number
    totalMessages: number
  }
  createdAt: string
  updatedAt: string
}

export interface PublicAgentInput {
  slug?: string
  name?: string
  avatar?: string
  description?: string
  greeting?: string
  systemPrompt?: string
  tools?: string[]
  libraryDocumentIds?: string[]
  published?: boolean
  allowedOrigins?: string[]
  dailyMessageCap?: number
  monthlyCostCapUsd?: number
}

export function createPublicAgentsApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<PublicAgentRecord[]>('/api/v1/public-agents'),
    get: (id: string) => client.get<PublicAgentRecord>(`/api/v1/public-agents/${id}`),
    create: (input: PublicAgentInput) => client.post<PublicAgentRecord>('/api/v1/public-agents', input),
    update: (id: string, input: PublicAgentInput) =>
      client.patch<PublicAgentRecord>(`/api/v1/public-agents/${id}`, input),
    remove: (id: string) => client.delete<{ ok: boolean }>(`/api/v1/public-agents/${id}`),
    libraryDocuments: () =>
      client.get<Array<{ id: string; title: string; sourceType: string }>>('/api/v1/public-agents/library-documents'),
  }
}
