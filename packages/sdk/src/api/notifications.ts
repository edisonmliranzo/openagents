import type { OpenAgentsClient } from '../client'
import type { Notification } from '@openagents/shared'

export function createNotificationsApi(client: OpenAgentsClient) {
  return {
    list: () =>
      client.get<Notification[]>('/api/v1/notifications'),

    markRead: (id: string) =>
      client.post<void>(`/api/v1/notifications/${id}/read`),

    markAllRead: () =>
      client.post<void>('/api/v1/notifications/read-all'),
  }
}
