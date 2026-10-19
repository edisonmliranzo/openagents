import type { OpenAgentsClient } from '../client'

export interface ScheduledTaskAction {
  type: 'send_message' | 'run_tool' | 'run_workflow'
  conversationId?: string
  message?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  workflowId?: string
}

export interface ScheduledTask {
  id: string
  userId: string
  name: string
  description: string
  /** Cron expression or 'once'. */
  schedule: string
  nextRunAt: string
  lastRunAt?: string
  lastRunStatus?: 'success' | 'failed'
  action: ScheduledTaskAction
  enabled: boolean
  runCount: number
  maxRuns?: number
  createdAt: string
}

export interface CreateScheduledTaskInput {
  userId: string
  name: string
  description?: string
  schedule: string
  action: ScheduledTaskAction
  maxRuns?: number
}

const BASE = '/api/v1/scheduler'

export function createSchedulerApi(client: OpenAgentsClient) {
  return {
    create: (input: CreateScheduledTaskInput) => client.post<ScheduledTask>(`${BASE}/tasks`, input),
    list: () => client.get<ScheduledTask[]>(`${BASE}/tasks`),
    get: (id: string) => client.get<ScheduledTask | null>(`${BASE}/tasks/${id}`),
    enable: (id: string) => client.post<ScheduledTask | null>(`${BASE}/tasks/${id}/enable`),
    disable: (id: string) => client.post<ScheduledTask | null>(`${BASE}/tasks/${id}/disable`),
    delete: (id: string) => client.delete<boolean>(`${BASE}/tasks/${id}`),
  }
}
