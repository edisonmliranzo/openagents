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

export interface NanobotSessionState {
  conversationId: string
  userId: string
  status: 'idle' | 'running' | 'waiting_tool' | 'failed' | 'done'
  updatedAt: string
  runCount: number
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
