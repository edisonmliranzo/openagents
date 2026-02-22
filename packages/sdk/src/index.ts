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
export { createNanobotApi } from './api/nanobot'
export { createSystemApi } from './api/system'
export { createLabsApi } from './api/labs'
export { createChannelsApi } from './api/channels'
export { createPlatformApi } from './api/platform'
export { createWorkflowsApi } from './api/workflows'
export { createMissionControlApi } from './api/mission-control'
export { createPlaybooksApi } from './api/playbooks'
export { createAgentVersionsApi } from './api/agent-versions'
export { createHandoffsApi } from './api/handoffs'
export { createSkillReputationApi } from './api/skill-reputation'
export { createLineageApi } from './api/lineage'

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
import { createNanobotApi } from './api/nanobot'
import { createSystemApi } from './api/system'
import { createLabsApi } from './api/labs'
import { createChannelsApi } from './api/channels'
import { createPlatformApi } from './api/platform'
import { createWorkflowsApi } from './api/workflows'
import { createMissionControlApi } from './api/mission-control'
import { createPlaybooksApi } from './api/playbooks'
import { createAgentVersionsApi } from './api/agent-versions'
import { createHandoffsApi } from './api/handoffs'
import { createSkillReputationApi } from './api/skill-reputation'
import { createLineageApi } from './api/lineage'
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
    nanobot: createNanobotApi(client),
    system: createSystemApi(client),
    labs: createLabsApi(client),
    channels: createChannelsApi(client),
    platform: createPlatformApi(client),
    workflows: createWorkflowsApi(client),
    missionControl: createMissionControlApi(client),
    playbooks: createPlaybooksApi(client),
    agentVersions: createAgentVersionsApi(client),
    handoffs: createHandoffsApi(client),
    skillReputation: createSkillReputationApi(client),
    lineage: createLineageApi(client),
  }
}
