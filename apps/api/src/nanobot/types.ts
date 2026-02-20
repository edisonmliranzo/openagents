export interface NanobotRunParams {
  conversationId: string
  userId: string
  userMessage: string
  emit: (event: string, data: unknown) => void
}

export interface NanobotRuntimeConfig {
  enabled: boolean
  maxLoopSteps: number
  shadowMode: boolean
  runtimeLabel: string
}

export interface NanobotConfigPatch {
  enabled?: boolean
  maxLoopSteps?: number
  shadowMode?: boolean
  runtimeLabel?: string
}

export interface NanobotChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
}

export interface NanobotToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface NanobotToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface NanobotProviderCompletion {
  content: string
  toolCalls?: NanobotToolCall[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
}

export interface NanobotProvider {
  id: string
  complete: (input: {
    userId: string
    messages: NanobotChatMessage[]
    tools: NanobotToolDef[]
    systemPrompt: string
    providerOverride?: string
  }) => Promise<NanobotProviderCompletion>
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
export type NanobotSubagentRole = 'planner' | 'executor' | 'critic' | 'telemetry'
export type NanobotSubagentStatus = 'queued' | 'running' | 'done' | 'error'

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

export interface NanobotSessionState {
  conversationId: string
  userId: string
  status: 'idle' | 'running' | 'waiting_tool' | 'failed' | 'done'
  updatedAt: string
  runCount: number
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

export type NanobotBusEventName =
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

export interface NanobotBusEvent {
  name: NanobotBusEventName
  payload: Record<string, unknown>
  createdAt: string
}
