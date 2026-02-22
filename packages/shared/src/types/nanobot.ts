export type NanobotSessionStatus = 'idle' | 'running' | 'waiting_tool' | 'failed' | 'done'
export type NanobotChannelStatus = 'enabled' | 'planned' | 'disabled'
export type NanobotSubagentRole = 'planner' | 'executor' | 'critic' | 'telemetry'
export type NanobotSubagentStatus = 'queued' | 'running' | 'done' | 'error'

export interface NanobotRuntimeConfig {
  enabled: boolean
  maxLoopSteps: number
  shadowMode: boolean
  runtimeLabel: string
}

export interface UpdateNanobotConfigInput {
  enabled?: boolean
  maxLoopSteps?: number
  shadowMode?: boolean
  runtimeLabel?: string
}

export interface NanobotSessionState {
  conversationId: string
  userId: string
  status: NanobotSessionStatus
  updatedAt: string
  runCount: number
}

export interface NanobotChannel {
  id: string
  label: string
  status: NanobotChannelStatus
}

export interface NanobotSkillManifest {
  id: string
  title: string
  description: string
  tools: string[]
  promptAppendix?: string
}

export interface NanobotSkillState extends NanobotSkillManifest {
  enabled: boolean
}

export type NanobotThoughtMode = 'explore' | 'plan' | 'act' | 'reflect'
export type NanobotTaskType = 'research' | 'ops' | 'support' | 'general'
export type NanobotThinkingDepth = 'fast' | 'balanced' | 'deep'
export type NanobotComplexity = 'low' | 'medium' | 'high'
export type NanobotUrgency = 'low' | 'normal' | 'high'
export type ApprovalRiskLevel = 'low' | 'medium' | 'high'

export interface NanobotPersonaProfile {
  id: string
  label: string
  description: string
  style: string
  mood: string
  energy: number
  decisiveness: number
  boundaries: string[]
}

export interface NanobotPersonalityState {
  profileId: string
  style: string
  mood: string
  energy: number
  decisiveness: number
  boundaries: string[]
  updatedAt: string
}

export interface NanobotRoleDecision {
  plannerGoal: string
  plannerPlan: string[]
  executorIntent: string
  criticConcerns: string[]
  confidence: number
  thoughtMode: NanobotThoughtMode
  taskType: NanobotTaskType
  thinkingDepth: NanobotThinkingDepth
  complexity: NanobotComplexity
  urgency: NanobotUrgency
}

export interface NanobotAliveState {
  activeGoal: string | null
  thoughtMode: NanobotThoughtMode
  taskType: NanobotTaskType
  thinkingDepth: NanobotThinkingDepth
  urgency: NanobotUrgency
  confidence: number
  intentionQueue: string[]
  waitingReason: string | null
  lastRoleDecision: NanobotRoleDecision | null
  updatedAt: string
}

export interface NanobotSubagentTask {
  id: string
  userId: string
  role: NanobotSubagentRole
  label: string
  status: NanobotSubagentStatus
  runId?: string
  createdAt: string
  updatedAt: string
}

export interface NanobotBusEvent {
  name:
    | 'run.started'
    | 'run.completed'
    | 'run.failed'
    | 'context.built'
    | 'tool.executed'
    | 'heartbeat.tick'
    | 'cron.triggered'
    | 'subagent.spawned'
    | 'subagent.completed'
    | 'orchestration.updated'
    | 'voice.processed'
    | 'capture.received'
    | 'run.event'
  payload: Record<string, unknown>
  createdAt: string
}

export interface NanobotPresenceTickResult {
  userId: string
  tickedAt: string
  source: 'manual' | 'auto'
  activeSessions: number
  actions: string[]
}

export interface NanobotMarketplacePack {
  id: string
  version: string
  title: string
  description: string
  tags: string[]
  personaProfileId?: string
  skills: NanobotSkillManifest[]
  installed: boolean
  signature?: NanobotSkillSignature
  signatureVerified?: boolean
}

export interface NanobotMarketplaceExportInput {
  name: string
  description?: string
  skillIds?: string[]
  includeOnlyEnabled?: boolean
  personaProfileId?: string
}

export interface NanobotMarketplaceExportPack {
  id: string
  version: string
  title: string
  description: string
  generatedAt: string
  personaProfileId?: string
  skills: NanobotSkillManifest[]
}

export interface NanobotSkillSignature {
  algorithm: 'HMAC-SHA256'
  keyId: string
  signedAt: string
  value: string
}

export interface NanobotSignedMarketplacePack extends NanobotMarketplaceExportPack {
  signature: NanobotSkillSignature
}

export interface NanobotMarketplaceExportResult {
  fileName: string
  savedAt: string
  pack: NanobotSignedMarketplacePack
}

export interface NanobotMarketplaceInstallResult {
  packId: string
  installedAt: string
  installedSkills: string[]
  appliedPersonaProfileId?: string
  signatureVerified?: boolean
  activeSkills: NanobotSkillState[]
  personality: NanobotPersonalityState
}

export interface NanobotMarketplaceVerifyResult {
  valid: boolean
  reason: string | null
  signature: NanobotSkillSignature
}

export interface NanobotMarketplaceImportInput {
  pack: NanobotSignedMarketplacePack
}

export type NanobotOrchestrationStage = 'planning' | 'executing' | 'reviewing' | 'done' | 'error'
export type NanobotOrchestrationTaskStatus = 'queued' | 'running' | 'done' | 'error'

export interface NanobotOrchestrationTask {
  id: string
  role: 'planner' | 'executor' | 'reviewer'
  label: string
  status: NanobotOrchestrationTaskStatus
  notes: string[]
  updatedAt: string
}

export interface NanobotOrchestrationSharedState {
  plan: string[]
  concerns: string[]
  toolLog: string[]
  summary: string | null
}

export interface NanobotOrchestrationRun {
  runId: string
  userId: string
  conversationId: string
  objective: string
  stage: NanobotOrchestrationStage
  sharedState: NanobotOrchestrationSharedState
  tasks: NanobotOrchestrationTask[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface NanobotVoiceTranscriptionInput {
  transcript?: string
  audioBase64?: string
  locale?: string
}

export interface NanobotVoiceTranscriptionResult {
  transcript: string
  locale: string
  confidence: number
  provider: string
}

export interface NanobotVoiceSynthesisInput {
  text: string
  voice?: string
  locale?: string
  rate?: number
  pitch?: number
}

export interface NanobotVoiceSynthesisResult {
  text: string
  locale: string
  voice: string
  ssml: string
  estimatedDurationMs: number
}

export interface NanobotAutonomyWindow {
  label?: string
  days: number[]
  start: string
  end: string
}

export interface NanobotAutonomySchedule {
  enabled: boolean
  timezone: string
  windows: NanobotAutonomyWindow[]
  updatedAt: string
}

export interface UpdateNanobotAutonomyInput {
  enabled?: boolean
  timezone?: string
  windows?: NanobotAutonomyWindow[]
}

export interface NanobotAutonomyStatus {
  now: string
  scheduleEnabled: boolean
  timezone: string
  withinWindow: boolean
  reason: string
  activeWindow: NanobotAutonomyWindow | null
}

export interface NanobotTrustAutonomy {
  score: number
  enabled: boolean
  shadowMode: boolean
  maxLoopSteps: number
  rationale: string
}

export interface NanobotTrustMemory {
  score: number
  presentFiles: string[]
  missingFiles: string[]
  rationale: string
}

export interface NanobotTrustTools {
  score: number
  totalCalls: number
  successRate: number
  failingTools: Array<{ tool: string; failures: number }>
  rationale: string
}

export interface NanobotTrustSafety {
  score: number
  pendingApprovals: number
  failedRuns24h: number
  rationale: string
}

export interface NanobotTrustCost {
  score: number
  estimated30dUsd: number
  avgDailyUsd: number
  rationale: string
}

export interface NanobotTrustSnapshot {
  generatedAt: string
  overallScore: number
  autonomy: NanobotTrustAutonomy
  memory: NanobotTrustMemory
  tools: NanobotTrustTools
  safety: NanobotTrustSafety
  cost: NanobotTrustCost
}

export interface NanobotThinkingRoute {
  thoughtMode: NanobotThoughtMode
  thinkingDepth: NanobotThinkingDepth
  taskType: NanobotTaskType
  complexity: NanobotComplexity
  urgency: NanobotUrgency
  rationale: string
}

export interface NanobotRuntimeAutomationState {
  updatedAt: string
  personaAutoSwitch: {
    enabled: boolean
    switched: boolean
    fromProfileId: string | null
    toProfileId: string | null
    reason: string
    taskType: NanobotTaskType
  }
  thinkingRouter: NanobotThinkingRoute
  approvalRisk: {
    level: ApprovalRiskLevel
    score: number
    reason: string
    autoApproved: boolean
    autonomyWithinWindow: boolean
    toolName: string | null
  }
}

export interface NanobotHeartbeatRecoveryResult {
  recovered: boolean
  staleMs: number
  staleSessions: number
  actions: string[]
  notified: boolean
  curated: boolean
  recoveredAt: string | null
}

export interface NanobotHeartbeatStatus {
  lastTickAt: string | null
  lastMissedAt: string | null
  lastRecoveryAt: string | null
  missedCount: number
  recoveryCount: number
}

export interface NanobotHeartbeatTickResult {
  userId: string
  tickedAt: string
  source: 'manual' | 'auto'
  recovery: NanobotHeartbeatRecoveryResult | null
  nightlyCurated: boolean
}

export interface NanobotMemoryCurationStatus {
  lastCuratedAt: string | null
  lastSource: 'manual' | 'nightly' | 'heartbeat-recovery' | null
  summaryPoints: number
  dedupedEntries: number
  expiredEntries: number
}

export interface NanobotMemoryCurationResult {
  curatedAt: string
  source: 'manual' | 'nightly' | 'heartbeat-recovery'
  summaryPoints: number
  dedupedEntries: number
  expiredEntries: number
  memoryEntries: number
  memoryFileBytes: number
}

export interface NanobotHealth {
  config: NanobotRuntimeConfig
  activeSessions: NanobotSessionState[]
  channels: NanobotChannel[]
  cliHints: string[]
  activeSkills: NanobotSkillState[]
  personaProfiles: NanobotPersonaProfile[]
  personality: NanobotPersonalityState
  alive: NanobotAliveState
  subagents: NanobotSubagentTask[]
  orchestration: NanobotOrchestrationRun[]
  runtimeAutomation: NanobotRuntimeAutomationState
  heartbeat: NanobotHeartbeatStatus
  memoryCuration: NanobotMemoryCurationStatus
}

export interface NanobotCronTriggerInput {
  jobName: string
}
