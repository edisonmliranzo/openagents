export interface NanobotRunParams {
  conversationId: string
  userId: string
  userMessage: string
  emit: (event: string, data: unknown) => void
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

