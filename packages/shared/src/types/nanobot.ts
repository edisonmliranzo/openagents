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
}

export interface NanobotAliveState {
  activeGoal: string | null
  thoughtMode: NanobotThoughtMode
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

export interface NanobotMarketplaceExportResult {
  fileName: string
  savedAt: string
  pack: NanobotMarketplaceExportPack
}

export interface NanobotMarketplaceInstallResult {
  packId: string
  installedAt: string
  installedSkills: string[]
  appliedPersonaProfileId?: string
  activeSkills: NanobotSkillState[]
  personality: NanobotPersonalityState
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
}

export interface NanobotCronTriggerInput {
  jobName: string
}
