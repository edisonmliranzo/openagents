export type NanobotSessionStatus = 'idle' | 'running' | 'waiting_tool' | 'failed' | 'done'
export type NanobotChannelStatus = 'enabled' | 'planned' | 'disabled'

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

export interface NanobotPersonalityState {
  style: string
  mood: string
  energy: number
  decisiveness: number
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

export interface NanobotHealth {
  config: NanobotRuntimeConfig
  activeSessions: NanobotSessionState[]
  channels: NanobotChannel[]
  cliHints: string[]
  activeSkills: NanobotSkillState[]
  personality: NanobotPersonalityState
  alive: NanobotAliveState
}

export interface NanobotCronTriggerInput {
  jobName: string
}
