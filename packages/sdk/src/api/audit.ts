import type { OpenAgentsClient } from '../client'
import type { AuditLog } from '@openagents/shared'

export function createAuditApi(client: OpenAgentsClient) {
  return {
    list: () =>
      client.get<AuditLog[]>('/api/v1/audit-logs'),
  }
}
