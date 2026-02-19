export type MessageRole = 'user' | 'agent' | 'tool' | 'system'
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error'

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  status: MessageStatus
  toolCall?: ToolCall
  toolResult?: ToolResult
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface Conversation {
  id: string
  userId: string
  title: string | null
  lastMessageAt: string | null
  createdAt: string
}

export interface ToolCall {
  toolId: string
  toolName: string
  input: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  output: unknown
  error?: string
}
