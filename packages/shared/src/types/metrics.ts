// Metrics types for analytics dashboard
export interface AgentMetrics {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  averageDurationMs: number
  totalTokens: number
  totalCost: number
}

export interface ToolMetrics {
  toolName: string
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  averageDurationMs: number
  totalCost: number
}

export interface ConversationMetrics {
  totalConversations: number
  totalMessages: number
  averageMessagesPerConversation: number
  averageConversationDurationMs: number
}

export interface UserMetrics {
  userId: string
  totalTokens: number
  totalCost: number
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  totalApprovals: number
  approvedApprovals: number
  deniedApprovals: number
  period: {
    start: string
    end: string
  }
}

export interface DailyMetrics {
  date: string
  runs: number
  tokens: number
  cost: number
  approvals: number
  conversations: number
}

export interface MetricsSummary {
  agent: AgentMetrics
  tools: ToolMetrics[]
  conversations: ConversationMetrics
  daily: DailyMetrics[]
}

export interface MetricsQuery {
  userId?: string
  startDate?: string
  endDate?: string
  groupBy?: 'day' | 'week' | 'month'
}

export interface TokenUsage {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
}

export interface ApprovalMetrics {
  total: number
  pending: number
  approved: number
  denied: number
  approvalRate: number
  averageResolutionTimeMs: number
}
