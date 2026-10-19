import type { OpenAgentsClient } from '../client'

export interface DelegationSubAgent {
  id: string
  name: string
  preset?: string
}

export type DelegationMergeStrategy = 'first_success' | 'best_of' | 'merge_all' | 'consensus'

export interface DelegationResult {
  subAgentId: string
  subAgentName: string
  status: 'completed' | 'failed'
  output: string
  confidence?: number
  tokensUsed?: number
  durationMs?: number
  completedAt?: string
}

export interface DelegationTask {
  id: string
  parentRunId: string
  userId: string
  objective: string
  subAgents: DelegationSubAgent[]
  mergeStrategy: DelegationMergeStrategy
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  results: DelegationResult[]
  createdAt: string
  completedAt?: string
}

export interface CreateDelegationTaskInput {
  parentRunId: string
  userId: string
  objective: string
  subAgents: DelegationSubAgent[]
  mergeStrategy?: DelegationMergeStrategy
}

const BASE = '/api/v1/delegation'

export function createDelegationApi(client: OpenAgentsClient) {
  return {
    create: (input: CreateDelegationTaskInput) => client.post<DelegationTask>(`${BASE}/tasks`, input),
    list: (limit?: number) =>
      client.get<DelegationTask[]>(`${BASE}/tasks${limit ? `?limit=${limit}` : ''}`),
    get: (id: string) => client.get<DelegationTask | { error: string }>(`${BASE}/tasks/${id}`),
    execute: (id: string) => client.post<DelegationResult>(`${BASE}/tasks/${id}/execute`),
    cancel: (id: string) => client.post<{ cancelled: boolean }>(`${BASE}/tasks/${id}/cancel`),
  }
}
