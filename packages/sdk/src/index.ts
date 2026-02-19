export { OpenAgentsClient, APIError } from './client'
export type { SDKConfig } from './client'
export { createAuthApi } from './api/auth'
export { createConversationsApi } from './api/conversations'
export { createApprovalsApi } from './api/approvals'
export { createSessionsApi } from './api/sessions'
export { createUsersApi } from './api/users'
export { createAuditApi } from './api/audit'
export { createNotificationsApi } from './api/notifications'
export { createToolsApi } from './api/tools'
export { createMemoryApi } from './api/memory'
export { createCronApi } from './api/cron'
export { createAgentApi } from './api/agent'

import { OpenAgentsClient } from './client'
import { createAuthApi } from './api/auth'
import { createConversationsApi } from './api/conversations'
import { createApprovalsApi } from './api/approvals'
import { createSessionsApi } from './api/sessions'
import { createUsersApi } from './api/users'
import { createAuditApi } from './api/audit'
import { createNotificationsApi } from './api/notifications'
import { createToolsApi } from './api/tools'
import { createMemoryApi } from './api/memory'
import { createCronApi } from './api/cron'
import { createAgentApi } from './api/agent'
import type { SDKConfig } from './client'

/** Convenience factory: creates a fully-wired SDK instance */
export function createSDK(config: SDKConfig) {
  const client = new OpenAgentsClient(config)
  return {
    client,
    auth: createAuthApi(client),
    conversations: createConversationsApi(client),
    approvals: createApprovalsApi(client),
    sessions: createSessionsApi(client),
    users: createUsersApi(client),
    audit: createAuditApi(client),
    notifications: createNotificationsApi(client),
    tools: createToolsApi(client),
    memory: createMemoryApi(client),
    cron: createCronApi(client),
    agent: createAgentApi(client),
  }
}
