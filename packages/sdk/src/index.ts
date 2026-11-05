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
export { createGovernanceApi } from './api/governance'
export type { GovPolicyRule, GovRuleInput, GovRuleMatch, GovRuleEffect, GovRuleScope, GovRuleEvaluation, GovEvaluationLogEntry, GovRuleTestInput, LedgerEntry, LedgerVerification, LedgerTamperDemo, LedgerExport, FirewallScan, FirewallFinding, FirewallDetection, FirewallCategory } from './api/governance'
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
export type { SpecialistAgentRow, RosterEntryRow } from './api/specialists'
export { createLibraryApi } from './api/library'
export type { LibraryDocumentRow, LibraryHit } from './api/library'
export { createPluginsApi } from './api/plugins'
export type { PluginRow } from './api/plugins'
export { createBrowserApi } from './api/browser'
export type { BrowserSessionRow, BrowserStateResult } from './api/browser'
export { createStudyApi } from './api/study'
export { createFrontierApi } from './api/frontier'
export { createTasksApi } from './api/tasks'
export { createAutonomyApi } from './api/autonomy'
export { createLifeApi } from './api/life'
export type { JanitorRunRow, JanitorMove, InboxDigestRow, CrmPersonRow, ClipRow, ApprovalRuleRow, AnticipationRow, ReplayDay, AgentTokenRow } from './api/life'
export type { MissionRow, MissionDetail, QuestionRow, JournalRow, GraphData, HandoffLinkRow } from './api/autonomy'
export type { CreateTaskInput, TaskDetail, TaskEventRow, TaskRow } from './api/tasks'
export type { FrontierStatus, TimelineHit, WatchTaskRow, PromptPatchRow, DebateResult, RoundtableResult, LearnedSkillRow } from './api/frontier'
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
import { createGovernanceApi } from './api/governance'
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
import { createFrontierApi } from './api/frontier'
import { createTasksApi } from './api/tasks'
import { createAutonomyApi } from './api/autonomy'
import { createLifeApi } from './api/life'
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
    governance: createGovernanceApi(client),
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
    frontier: createFrontierApi(client),
    tasks: createTasksApi(client),
    autonomy: createAutonomyApi(client),
    life: createLifeApi(client),
    workspaces: createWorkspacesApi(client),
    packs: createPacksApi(client),
    research: createResearchApi(client),
    briefing: createBriefingApi(client),
    costs: createCostsApi(client),
    orchestration: createOrchestrationApi(client),
    warRooms: createWarRoomsApi(client),
    pins: createPinsApi(client),
    reactions: createReactionsApi(client),
    templates: createTemplatesApi(client),
    hooks: createHooksApi(client),
    vault: createVaultApi(client),
    modelRoles: createModelRolesApi(client),
    mcp: createMcpApi(client),
    generativeUi: createGenerativeUiApi(client),
    delegation: createDelegationApi(client),
    agentMarketplace: createAgentMarketplaceApi(client),
    teamWorkspace: createTeamWorkspaceApi(client),
    trustCenter: createTrustCenterApi(client),
    scheduler: createSchedulerApi(client),
    billing: createBillingApi(client),
    marketplace: createMarketplaceApi(client),
    emailAutopilot: createEmailAutopilotApi(client),
    graph: createGraphApi(client),
    moments: createMomentsApi(client),
    phone: createPhoneApi(client),
    growthVoice: createGrowthVoiceApi(client),
    privacy: createPrivacyApi(client),
    publicAgents: createPublicAgentsApi(client),
    replay: createReplayApi(client),
    smartRouter: createSmartRouterApi(client),
    evalSuites: createEvalSuitesApi(client),
    boardroom: createBoardroomApi(client),
    durable: createDurableApi(client),
    sandboxExec: createSandboxExecApi(client),
    keys: createKeysApi(client),
    skillProposals: createSkillProposalsApi(client),
    sync: createSyncApi(client),
    agenticSuite: createAgenticSuiteApi(client),
  }
}

export { createResearchApi } from './api/research'
export { createBriefingApi } from './api/briefing'
export { createCostsApi } from './api/costs'
export { createOrchestrationApi } from './api/orchestration'
export { createWarRoomsApi } from './api/war-rooms'
export { createPinsApi } from './api/pins'
export { createReactionsApi } from './api/reactions'
export { createTemplatesApi } from './api/templates'
export { createHooksApi } from './api/hooks'
export { createVaultApi } from './api/vault'
export { createModelRolesApi } from './api/model-roles'
export { createMcpApi } from './api/mcp'
export type { McpServerView, CreateMcpServerInput, McpConnectResult } from './api/mcp'
export { createGenerativeUiApi } from './api/generative-ui'
export type { GenerativeComponent } from './api/generative-ui'
export type { PinnedMessage } from './api/pins'
export type { MessageReaction, ReactionCounts } from './api/reactions'
export type { ConversationTemplate, CreateTemplateInput } from './api/templates'
export { createDelegationApi } from './api/delegation'
export { createSchedulerApi } from './api/scheduler'
export type { ScheduledTask, CreateScheduledTaskInput } from './api/scheduler'
export { toCronSchedule } from './api/scheduler'
import { createResearchApi } from './api/research'
import { createBriefingApi } from './api/briefing'
import { createCostsApi } from './api/costs'
import { createOrchestrationApi } from './api/orchestration'
import { createWarRoomsApi } from './api/war-rooms'
import { createPinsApi } from './api/pins'
import { createReactionsApi } from './api/reactions'
import { createTemplatesApi } from './api/templates'
import { createHooksApi } from './api/hooks'
import { createVaultApi } from './api/vault'
import { createModelRolesApi } from './api/model-roles'
import { createMcpApi } from './api/mcp'
import { createGenerativeUiApi } from './api/generative-ui'
import { createDelegationApi } from './api/delegation'
import { createAgentMarketplaceApi } from './api/agent-marketplace'
import { createTeamWorkspaceApi } from './api/team-workspace'
import { createTrustCenterApi } from './api/trust-center'
export { createAgentMarketplaceApi } from './api/agent-marketplace'
export type { AgentPermissionManifest, AgentListingRow, AgentInstallRow, AgentMarketplaceInfo, AgentMarketplaceEarnings, PublishAgentListingInput, InstallAgentListingInput } from './api/agent-marketplace'
export { createTeamWorkspaceApi } from './api/team-workspace'
export type { TeamRole, TeamRisk, TeamMemberRow, TeamOverview, TeamDelegationRule, TeamDelegation, TeamMemoryScope, TeamMemoryEntry, TeamActivityEntry, TeamPendingApproval } from './api/team-workspace'
export { createTrustCenterApi } from './api/trust-center'
export type { TrustControl, TrustPosture, TrustSubprocessor, TrustRetention, TrustDataRequest } from './api/trust-center'
import { createSchedulerApi } from './api/scheduler'

export { createBillingApi, createMarketplaceApi } from './api/billing'
export { createEmailAutopilotApi } from './api/email-autopilot'
export { createGraphApi } from './api/graph'
export { createMomentsApi } from './api/moments'
export { createPhoneApi } from './api/phone'
export { createGrowthVoiceApi } from './api/growth-voice'
export type { OutreachItem, OutreachChannel, OutreachStatus, OutreachRateRow, OutreachExperiment, OutreachAnalytics, OutreachPromotion, GrowthContact, ContactStage, ContactInteraction, ContactBrief, VoiceSession, VoiceSessionSummary, VoiceTurn, VoiceRole } from './api/growth-voice'
export { createPrivacyApi } from './api/privacy'
export { createPublicAgentsApi } from './api/public-agents'
export { createReplayApi } from './api/replay'
export { createSmartRouterApi } from './api/smart-router'
export type { SmartRouterPolicy, SmartRouterPreview, SmartRouterRun, SmartRouterSavings, SmartRouterAttempt, RouterRung } from './api/smart-router'
export { createEvalSuitesApi } from './api/eval-suites'
export type { EvalSuiteRow, EvalCaseDef, EvalAssertionDef, EvalAssertionType, EvalSuiteTarget, EvalCaseResult, EvalAssertionResult, EvalSuiteRunSummary, EvalSuiteRunDetail, EvalSuiteComparison, EvalGateResult, EvalGateOptions } from './api/eval-suites'
export { createBoardroomApi } from './api/boardroom'
export type { BoardAgentDef, BoardRubricCriterion, BoardArgumentRow, BoardRoundRow, BoardVerdictRow, BoardSessionRow, BoardSessionSummary, BoardStartInput } from './api/boardroom'
export { createDurableApi } from './api/durable'
export type { DurableRun, DurableRunSummary, DurableStep, DurableStepInput, DurableStepKind, DurableRunStatus } from './api/durable'
export { createSandboxExecApi } from './api/sandbox-exec'
export type { SandboxLanguage, SandboxRunResult, SandboxStatus, SandboxRunRequest, SandboxMode } from './api/sandbox-exec'
export type { ReplayTimeline, ReplayForkSummary, ReplayForkDiff, ReplayForkRequest, ReplayRunSummary } from './api/replay'
export { createKeysApi, createSkillProposalsApi, createSyncApi } from './api/keys-sync'
export type { KeyStatus, KeyRotationEvent, SkillProposalRow, SkillProposalStep, SkillProposalInput, SkillProposalEdit, SyncDeviceRow, SyncRecordRow, SyncConflictRow, SyncKeyringRow, SyncStateRow } from './api/keys-sync'
export { createAgenticSuiteApi } from './api/agentic-suite'
export type {
  ForgedToolItem,
  ActionBranch,
  TreeOfActionsRollout,
  ComputerUseStep,
  ComputerUseSession,
  SentinelWatcher,
  SentinelIncident,
  BreakerFinding,
  AdversarialVerificationRun,
  OvernightCheckpoint,
  OvernightMission,
  WorldStateNode,
  ShadowActionCard,
  DigitalTwinState,
  SpecialistBidder,
  SubtaskBid,
  AwardedSubtask,
  SwarmMarketContractRun,
  GrokToneMode,
  GrokCitation,
  GrokDeepSearchResult,
  GrokPulseItem,
  OpenClawChannelNode,
  OpenClawHeartbeatRun,
  OpenClawSoulState,
  HermesSteerConfig,
  HermesTraceRun,
  DotsExpertAllocation,
  DotsConnectedNode,
  DotsRouteResult,
  SpeculativePrediction,
  CopilotVisualAnalysis,
  PromptChromosome,
  RecordedMacroStep,
  WebWorkflowMacro,
  LiveMicroApp,
  TemporalEventNode,
  ContradictionAlert,
  TimeMachineState,
  FirewallRuleItem,
  FirewallPacketInspection,
  ProviderArbitrageRow,
  FinOpsArbitrageState,
  WarRoomParticipant,
  WarRoomTurn,
  MultiplayerWarRoomState,
  ShipPipelineStep,
  ShipPipelineRun,
  DistilledTrajectorySample,
  DistillerState,
  PersonaCritique,
  BoardroomSimulationRun,
  ChaosFinding,
  ChaosRunReport,
  CartographerNode,
  CartographerMapState,
  GrowthExperiment,
  OmnichannelTouchType,
  OmnichannelPlatform,
  OmnichannelProspectDraft,
  OwnPostReplyWatchItem,
  OmnichannelConnector,
  GrowthAutopilotState,
  CryptoExecutionReceipt,
  CryptoLedgerState,
  BeamDropItem,
  ReverseEngineeredSdk,
  InterceptedNoiseItem,
  FlowGuardianState,
  SqlOptimizationReport,
} from './api/agentic-suite'
import { createBillingApi, createMarketplaceApi } from './api/billing'
import { createEmailAutopilotApi } from './api/email-autopilot'
import { createGraphApi } from './api/graph'
import { createMomentsApi } from './api/moments'
import { createPhoneApi } from './api/phone'
import { createGrowthVoiceApi } from './api/growth-voice'
import { createPrivacyApi } from './api/privacy'
import { createPublicAgentsApi } from './api/public-agents'
import { createReplayApi } from './api/replay'
import { createSmartRouterApi } from './api/smart-router'
import { createEvalSuitesApi } from './api/eval-suites'
import { createBoardroomApi } from './api/boardroom'
import { createDurableApi } from './api/durable'
import { createSandboxExecApi } from './api/sandbox-exec'
import { createKeysApi, createSkillProposalsApi, createSyncApi } from './api/keys-sync'
import { createAgenticSuiteApi } from './api/agentic-suite'
