import type { OpenAgentsClient } from '../client'

export interface CostEntry {
  id: string
  userId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  conversationId: string
  runId?: string
  createdAt: string
}

export interface CostBucket { costUsd: number; runs: number; tokens: number }
export interface CostDailyPoint { date: string; costUsd: number; tokens: number; runs: number }

export interface BudgetStatus {
  capUsd: number
  alertThresholdPct: number
  spentUsd: number
  pct: number
  alert: boolean
  exceeded: boolean
}

export interface CostSummary {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalRuns: number
  byProvider: Record<string, CostBucket>
  byModel: Record<string, CostBucket & { provider: string }>
  daily: CostDailyPoint[]
  monthToDateUsd: number
  todayUsd: number
  budget: BudgetStatus
  period: { from: string; to: string }
}

export type RouterMode = 'manual' | 'auto-cheapest' | 'balanced' | 'best'
export type RouterTier = 'simple' | 'standard' | 'complex'

export interface RouterSettings {
  mode: RouterMode
  tiers: Record<RouterTier, { provider: string; model: string }>
  monthlyBudgetUsd: number
  alertThresholdPct: number
  updatedAt?: string
}

export interface RouteDecision {
  provider: string
  model: string
  tier: RouterTier
  score: number
  reasons: string[]
  mode: RouterMode
  overBudget: boolean
}

export function createCostsApi(client: OpenAgentsClient) {
  return {
    summary: (days?: number) =>
      client.get<CostSummary>(`/api/v1/costs/summary${days ? `?days=${days}` : ''}`),
    history: (limit?: number) =>
      client.get<CostEntry[]>(`/api/v1/costs/history${limit ? `?limit=${limit}` : ''}`),
    getRouter: () => client.get<RouterSettings>('/api/v1/costs/router'),
    updateRouter: (input: Partial<RouterSettings>) => client.put<RouterSettings>('/api/v1/costs/router', input),
    previewRoute: (prompt: string, toolCount?: number) =>
      client.post<RouteDecision>('/api/v1/costs/router/preview', { prompt, toolCount }),
  }
}
