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

export type MetricsGroupBy = 'day' | 'week' | 'month'

export interface MetricsQuery {
  userId?: string
  startDate?: string
  endDate?: string
  groupBy?: MetricsGroupBy
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

export interface BudgetLimit {
  id: string
  budgetType: string
  limitUsd: number
  alertAtUsd: number | null
  currentSpentUsd: number
  remainingUsd: number
  percentUsed: number
  enabled: boolean
  periodStart: string
  periodEnd: string
}

export interface BudgetStatusEntry {
  id: string
  budgetType: string
  limitUsd: number
  currentSpentUsd: number
  alertAtUsd: number | null
  remainingUsd: number
  percentUsed: number
  isOverBudget: boolean
  isNearLimit: boolean
}

export interface BudgetStatus {
  overBudget: boolean
  budgets: BudgetStatusEntry[]
}

export interface SetBudgetLimitInput {
  budgetType: string
  limitUsd: number
  alertAtUsd?: number
}

export interface LogMetricInput {
  metricType: string
  action: string
  provider?: string
  model?: string
  durationMs?: number
  tokensUsed?: number
  costUsd?: number
  conversationId?: string
  toolName?: string
  metadata?: Record<string, unknown>
}

export interface MetricLogEntry {
  id: string
  userId: string
  metricType: string
  action: string
  provider: string | null
  model: string | null
  durationMs: number | null
  tokensUsed: number | null
  costUsd: number | null
  conversationId: string | null
  toolName: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
