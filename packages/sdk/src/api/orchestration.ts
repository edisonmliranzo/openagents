import type { OpenAgentsClient } from '../client'

export type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface OrchestrationTask {
  id: string
  agentId: string
  objective: string
  input: unknown
  dependencies: string[]
  status: AgentTaskStatus
  result?: unknown
  error?: string
  priority: number
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export interface OrchestrationPlan {
  id: string
  objective: string
  tasks: OrchestrationTask[]
  executionOrder: string[]
  status: 'planning' | 'executing' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
}

export interface OrchestrationHealth {
  activePlans: number
  totalTasks: number
  systemStatus: string
}

const BASE = '/api/v1/orchestration'

export function createOrchestrationApi(client: OpenAgentsClient) {
  return {
    createPlan: (input: { objective: string; context?: Record<string, unknown> }) =>
      client.post<OrchestrationPlan>(`${BASE}/plans`, input),
    listPlans: () => client.get<OrchestrationPlan[]>(`${BASE}/plans`),
    getPlan: (planId: string) => client.get<OrchestrationPlan | null>(`${BASE}/plans/${planId}`),
    executePlan: (planId: string) => client.post<void>(`${BASE}/plans/${planId}/execute`),
    cancelPlan: (planId: string) => client.put<boolean>(`${BASE}/plans/${planId}/cancel`),
    deletePlan: (planId: string) => client.delete<boolean>(`${BASE}/plans/${planId}`),
    getTasks: (planId: string) => client.get<OrchestrationTask[]>(`${BASE}/plans/${planId}/tasks`),
    getExecutionOrder: (planId: string) => client.get<string[]>(`${BASE}/plans/${planId}/execution-order`),
    health: () => client.get<OrchestrationHealth>(`${BASE}/health`),
  }
}
