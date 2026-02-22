import type { OpenAgentsClient } from '../client'
import type {
  CreateHandoffInput,
  HandoffStatus,
  HumanHandoffTicket,
  ReplyHandoffInput,
  ResolveHandoffInput,
} from '@openagents/shared'

export function createHandoffsApi(client: OpenAgentsClient) {
  return {
    list: (status?: HandoffStatus) =>
      client.get<HumanHandoffTicket[]>(`/api/v1/handoffs${status ? `?status=${status}` : ''}`),

    get: (id: string) => client.get<HumanHandoffTicket>(`/api/v1/handoffs/${id}`),

    getActive: (conversationId: string) =>
      client.get<HumanHandoffTicket | null>(`/api/v1/handoffs/active/${conversationId}`),

    create: (input: CreateHandoffInput) =>
      client.post<HumanHandoffTicket>('/api/v1/handoffs', input),

    claim: (id: string) =>
      client.post<HumanHandoffTicket>(`/api/v1/handoffs/${id}/claim`),

    reply: (id: string, input: ReplyHandoffInput) =>
      client.post<HumanHandoffTicket>(`/api/v1/handoffs/${id}/reply`, input),

    resolve: (id: string, input: ResolveHandoffInput = {}) =>
      client.post<HumanHandoffTicket>(`/api/v1/handoffs/${id}/resolve`, input),

    returnToAgent: (id: string) =>
      client.post<HumanHandoffTicket>(`/api/v1/handoffs/${id}/return`),
  }
}
