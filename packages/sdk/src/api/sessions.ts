import type { OpenAgentsClient } from '../client'
import type { SessionPatchInput, SessionPatchResult, SessionsListResult } from '@openagents/shared'

export interface ListSessionsParams {
  activeMinutes?: number
  limit?: number
  includeGlobal?: boolean
  includeUnknown?: boolean
}

function toQuery(params: ListSessionsParams) {
  const query = new URLSearchParams()
  if (params.activeMinutes && params.activeMinutes > 0) {
    query.set('activeMinutes', String(params.activeMinutes))
  }
  if (params.limit && params.limit > 0) {
    query.set('limit', String(params.limit))
  }
  if (typeof params.includeGlobal === 'boolean') {
    query.set('includeGlobal', String(params.includeGlobal))
  }
  if (typeof params.includeUnknown === 'boolean') {
    query.set('includeUnknown', String(params.includeUnknown))
  }
  return query.toString()
}

export function createSessionsApi(client: OpenAgentsClient) {
  return {
    list: (params: ListSessionsParams = {}) => {
      const qs = toQuery(params)
      return client.get<SessionsListResult>(`/api/v1/sessions${qs ? `?${qs}` : ''}`)
    },

    patch: (id: string, patch: SessionPatchInput) =>
      client.patch<SessionPatchResult>(`/api/v1/sessions/${id}`, patch),

    delete: (id: string) =>
      client.delete<void>(`/api/v1/sessions/${id}`),
  }
}
