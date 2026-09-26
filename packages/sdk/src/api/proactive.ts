import type { OpenAgentsClient } from '../client'

export interface ProactiveTriggerRow {
  id: string
  userId: string
  source: string
  condition: string
  actionText: string
  enabled: boolean
  lastFiredAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProactiveLogRow {
  id: string
  triggerId: string
  userId: string
  event: string
  status: string
  detail: string | null
  createdAt: string
}

export function createProactiveApi(client: OpenAgentsClient) {
  return {
    listTriggers: () => client.get<ProactiveTriggerRow[]>('/api/v1/proactive/triggers'),

    createTrigger: (input: { source: string; condition?: string; actionText: string; enabled?: boolean }) =>
      client.post<ProactiveTriggerRow>('/api/v1/proactive/triggers', input),

    enableTrigger: (id: string) =>
      client.patch<ProactiveTriggerRow>(`/api/v1/proactive/triggers/${id}/enable`),

    disableTrigger: (id: string) =>
      client.patch<ProactiveTriggerRow>(`/api/v1/proactive/triggers/${id}/disable`),

    deleteTrigger: (id: string) =>
      client.delete<{ ok: true }>(`/api/v1/proactive/triggers/${id}`),

    listLogs: (limit = 20) =>
      client.get<ProactiveLogRow[]>(`/api/v1/proactive/logs?limit=${limit}`),
  }
}
