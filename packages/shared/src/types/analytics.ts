/**
 * Analytics types for OpenAgents platform
 */

export interface AnalyticsSummary {
  tokenUsage: TokenUsageMetrics
  costAnalysis: CostAnalysis
  performance: PerformanceMetrics
  trends: UsageTrends
  predictions: PredictiveAnalytics
  generatedAt: string
}

export interface TokenUsageMetrics {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  byAgent: AgentTokenUsage[]
  dailyTrends: DailyTokenUsage[]
  averageDailyTokens: number
}

export interface AgentTokenUsage {
  agentId: string
  agentName: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
}

export interface DailyTokenUsage {
  date: string
  totalTokens: number
}

export interface CostAnalysis {
  totalCost: number
  costByModel: ModelCost[]
  dailyTrends: DailyCost[]
  averageDailyCost: number
  costPerMillionTokens: number
  projectedMonthlyCost: number
  optimizationSuggestions: string[]
}

export interface ModelCost {
  model: string
  totalCost: number
  totalTokens: number
  costPerMillionTokens: number
}

export interface DailyCost {
  date: string
  totalCost: number
}

export interface PerformanceMetrics {
  avgResponseTimeMs: number
  p95ResponseTimeMs: number
  avgSuccessRate: number
  totalRequests: number
  byAgent: AgentPerformance[]
  topTools: ToolUsage[]
}

export interface AgentPerformance {
  agentId: string
  agentName: string
  avgResponseTimeMs: number
  p95ResponseTimeMs: number
  successRate: number
  totalRequests: number
}

export interface ToolUsage {
  toolName: string
  usageCount: number
  avgExecutionTimeMs: number
}

export interface UsageTrends {
  peakUsageHours: PeakHour[]
  hourlyPatterns: HourlyPattern[]
  dailyActiveUsers: DailyActiveUser[]
  growthRate: number
}

export interface PeakHour {
  hour: number
  avgRequests: number
}

export interface HourlyPattern {
  hour: number
  avgRequests: number
}

export interface DailyActiveUser {
  date: string
  activeUsers: number
}

export interface PredictiveAnalytics {
  projectedMonthlyTokens: number
  projectedMonthlyCost: number
  confidenceScore: number
  anomalies: Anomaly[]
  recommendations: string[]
  trendDirection: 'increasing' | 'decreasing'
  growthRate: number
}

export interface Anomaly {
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
  value: number
}

// Dashboard-related types
export interface DashboardWidget {
  id: string
  type: 'chart' | 'metric' | 'table' | 'alert'
  title: string
  config: Record<string, unknown>
  position: { x: number; y: number; w: number; h: number }
}

export interface DashboardConfig {
  id: string
  name: string
  userId: string
  widgets: DashboardWidget[]
  createdAt: string
  updatedAt: string
}

// Alert types
export interface AlertConfig {
  id: string
  name: string
  type: 'cost' | 'usage' | 'performance' | 'error'
  condition: AlertCondition
  threshold: number
  action: 'email' | 'webhook' | 'slack' | 'sms'
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface AlertCondition {
  metric: string
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  value: number
  timeframe: '1h' | '6h' | '24h' | '7d' | '30d'
}

export interface Alert {
  id: string
  configId: string
  triggeredAt: string
  metric: string
  value: number
  threshold: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  acknowledged: boolean
  acknowledgedAt?: string
  acknowledgedBy?: string
}

// Report types
export interface ReportConfig {
  id: string
  name: string
  type: 'usage' | 'cost' | 'performance' | 'compliance'
  schedule: 'daily' | 'weekly' | 'monthly'
  format: 'pdf' | 'csv' | 'json'
  recipients: string[]
  filters: Record<string, unknown>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface Report {
  id: string
  configId: string
  generatedAt: string
  period: { start: string; end: string }
  data: Record<string, unknown>
  format: string
  url?: string
}