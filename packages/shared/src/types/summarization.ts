// Summarization types for conversation highlights
export interface ConversationSummary {
  id: string
  conversationId: string
  summary: string
  highlights: ConversationHighlight[]
  keyTopics: string[]
  actionItems: ActionItem[]
  createdAt: string
  updatedAt: string
  type: 'auto' | 'manual'
  userId: string
}

export interface ConversationHighlight {
  id: string
  messageId: string
  type: 'key_point' | 'decision' | 'question' | 'insight' | 'action'
  content: string
  importance: 'low' | 'medium' | 'high'
  startIndex: number
  endIndex: number
}

export interface ActionItem {
  id: string
  description: string
  assignee?: string
  dueDate?: string
  status: 'pending' | 'completed' | 'deferred'
  sourceMessageId: string
  createdAt: string
}

export interface SummarizeRequest {
  conversationId: string
  type?: 'full' | 'recent' | 'delta'
  maxHighlights?: number
  includeActionItems?: boolean
  language?: string
}

export interface SummarizeResponse {
  summary: ConversationSummary
  tokensUsed?: number
  model?: string
}

export interface HighlightConfig {
  enabled: boolean
  minImportance: 'low' | 'medium' | 'high'
  maxHighlightsPerConversation: number
  autoGenerateActionItems: boolean
  highlightTypes: ConversationHighlight['type'][]
}

export interface GenerateHighlightsRequest {
  conversationId: string
  messageIds?: string[]
  config?: Partial<HighlightConfig>
}
