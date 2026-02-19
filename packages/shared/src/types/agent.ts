export type LLMProvider = 'anthropic' | 'openai' | 'ollama'
export type AgentStatus = 'idle' | 'thinking' | 'running_tool' | 'waiting_approval' | 'done' | 'error'

export interface AgentConfig {
  provider: LLMProvider
  model: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface AgentRun {
  id: string
  conversationId: string
  status: AgentStatus
  startedAt: string
  finishedAt: string | null
  error?: string
}
