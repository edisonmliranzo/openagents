import type { OpenAgentsClient } from '../client'
import type { Approval } from '@openagents/shared'

export function createApprovalsApi(client: OpenAgentsClient) {
  return {
    list: (status?: 'pending' | 'approved' | 'denied') => {
      const qs = status ? `?status=${status}` : ''
      return client.get<Approval[]>(`/api/v1/approvals${qs}`)
    },

    approve: (id: string) =>
      client.post<Approval>(`/api/v1/approvals/${id}/approve`),

    deny: (id: string) =>
      client.post<Approval>(`/api/v1/approvals/${id}/deny`),
  }
}
