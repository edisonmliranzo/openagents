import type { OpenAgentsClient } from '../client'
import type { AuditLog } from '@openagents/shared'

export interface AuditLogFilters {
  action?: string
  tool?: string
  /** ISO date/time lower bound (inclusive) */
  from?: string
  /** ISO date/time upper bound (inclusive) */
  to?: string
  limit?: number
}

export interface AuditLogRecord extends AuditLog {
  category?: string
  resource?: string
  severity?: string
  description?: string
  timestamp?: string
  reversible?: boolean
  undoneAt?: string | null
}

export interface AuditUndoResult {
  ok: boolean
  reversible: boolean
  message: string
  undoneAt?: string
}

export function createAuditApi(client: OpenAgentsClient) {
  return {
    list: (filters: AuditLogFilters = {}) => {
      const qs = new URLSearchParams()
      if (filters.action) qs.set('action', filters.action)
      if (filters.tool) qs.set('tool', filters.tool)
      if (filters.from) qs.set('from', filters.from)
      if (filters.to) qs.set('to', filters.to)
      if (typeof filters.limit === 'number') qs.set('limit', String(filters.limit))
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return client.get<AuditLogRecord[]>(`/api/v1/audit-logs${suffix}`)
    },

    undo: (id: string) =>
      client.post<AuditUndoResult>(`/api/v1/audit-logs/${encodeURIComponent(id)}/undo`),
  }
}
