import type { OpenAgentsClient } from '../client'

export interface TaskRow {
  id: string
  title: string
  goal: string
  status: string
  cursor: number
  replans: number
  createdAt: string
  finishedAt: string | null
  error: string | null
}

export interface TaskEventRow {
  id: string
  kind: string
  message: string
  data: string | null
  createdAt: string
}

export interface TaskDetail extends TaskRow {
  plan: string
  result: string | null
  verdict: string | null
  events: TaskEventRow[]
}

export interface CreateTaskInput {
  goal: string
  successCriteria?: string
  target?: string
  maxSteps?: number
}

export function createTasksApi(client: OpenAgentsClient) {
  return {
    create: (input: CreateTaskInput) => client.post<TaskRow>('/api/v1/tasks', input),
    list: () => client.get<TaskRow[]>('/api/v1/tasks'),
    get: (id: string) => client.get<TaskDetail>(`/api/v1/tasks/${id}`),
    approve: (id: string) => client.post<{ ok: boolean }>(`/api/v1/tasks/${id}/approve`),
    cancel: (id: string) => client.post<{ ok: boolean }>(`/api/v1/tasks/${id}/cancel`),
  }
}
