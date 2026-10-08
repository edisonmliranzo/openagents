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
export { createHandoffsApi } from './api/handoffs'
export { createSkillReputationApi } from './api/skill-reputation'
export { createLineageApi } from './api/lineage'
export { createPolicyApi } from './api/policy'
export { createExtractionApi } from './api/extraction'
export { createCiHealerApi } from './api/ci-healer'
export { createSkillRegistryApi } from './api/skill-registry'
export { createAgentVersionsApi } from './api/agent-versions'
export { createConnectorsApi } from './api/connectors'
export { createMetricsApi } from './api/metrics'
export type { LiveMetrics } from './api/metrics'
export { createTriggersApi } from './api/triggers'
export { createWebhooksApi } from './api/webhooks'
export { createAgentPresetsApi } from './api/agent-presets'
export { createArtifactsApi } from './api/artifacts'
export { createGoalsApi } from './api/goals'
export type { MuseGoal, MuseGoalMilestone, CreateMuseGoalInput } from './api/goals'
export { createProactiveApi } from './api/proactive'
export type { ProactiveTriggerRow, ProactiveLogRow } from './api/proactive'
export { createLearningApi } from './api/learning'
export type { SkillSuggestionRow, UserSkillRow } from './api/learning'
export { createReflectionApi } from './api/reflection'
export type { ReflectionResult } from './api/reflection'
export { createSpecialistsApi } from './api/specialists'
export type { SpecialistAgentRow } from './api/specialists'
export { createLibraryApi } from './api/library'
export type { LibraryDocumentRow, LibraryHit } from './api/library'
export { createPluginsApi } from './api/plugins'
export type { PluginRow } from './api/plugins'
export { createBrowserApi } from './api/browser'
export type { BrowserSessionRow, BrowserStateResult } from './api/browser'
export { createStudyApi } from './api/study'
export type { KnowledgeGapRow } from './api/study'
export { createWorkspacesApi } from './api/workspaces'
export { createPacksApi } from './api/packs'

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
import { createHandoffsApi } from './api/handoffs'
import { createSkillReputationApi } from './api/skill-reputation'
import { createLineageApi } from './api/lineage'
import { createPolicyApi } from './api/policy'
import { createExtractionApi } from './api/extraction'
import { createCiHealerApi } from './api/ci-healer'
import { createSkillRegistryApi } from './api/skill-registry'
import { createAgentVersionsApi } from './api/agent-versions'
import { createConnectorsApi } from './api/connectors'
import { createMetricsApi } from './api/metrics'
import { createTriggersApi } from './api/triggers'
import { createWebhooksApi } from './api/webhooks'
import { createAgentPresetsApi } from './api/agent-presets'
import { createArtifactsApi } from './api/artifacts'
import { createGoalsApi } from './api/goals'
import { createProactiveApi } from './api/proactive'
import { createLearningApi } from './api/learning'
import { createReflectionApi } from './api/reflection'
import { createSpecialistsApi } from './api/specialists'
import { createLibraryApi } from './api/library'
import { createPluginsApi } from './api/plugins'
import { createBrowserApi } from './api/browser'
import { createStudyApi } from './api/study'
import { createWorkspacesApi } from './api/workspaces'
import { createPacksApi } from './api/packs'
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
    handoffs: createHandoffsApi(client),
    skillReputation: createSkillReputationApi(client),
    lineage: createLineageApi(client),
    policy: createPolicyApi(client),
    extraction: createExtractionApi(client),
    ciHealer: createCiHealerApi(client),
    skillRegistry: createSkillRegistryApi(client),
    agentVersions: createAgentVersionsApi(client),
    connectors: createConnectorsApi(client),
    metrics: createMetricsApi(client),
    triggers: createTriggersApi(client),
    webhooks: createWebhooksApi(client),
    agentPresets: createAgentPresetsApi(client),
    artifacts: createArtifactsApi(client),
    goals: createGoalsApi(client),
    proactive: createProactiveApi(client),
    learning: createLearningApi(client),
    reflection: createReflectionApi(client),
    specialists: createSpecialistsApi(client),
    library: createLibraryApi(client),
    plugins: createPluginsApi(client),
    browser: createBrowserApi(client),
    study: createStudyApi(client),
    workspaces: createWorkspacesApi(client),
    packs: createPacksApi(client),
  }
}
