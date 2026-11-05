import type { OpenAgentsClient } from '../client'

export interface RouterRung { provider: string; model: string }

export interface SmartRouterPolicy {
  enabled: boolean
  ladder: RouterRung[]
  minConfidence: number
  maxEscalations: number
  checks: { refusal: boolean; malformed: boolean; lowConfidence: boolean }
  standardAt: number
  complexAt: number
  updatedAt?: string
}

export interface SmartRouterPreview {
  enabled: boolean
  chosen: RouterRung
  startRung: number
  complexity: number
  tier: string
  escalationPath: RouterRung[]
  reasoning: string[]
  estimatedCostUsd: number
  topModelCostUsd: number
  estimatedSavingsUsd: number
}

export interface SmartRouterAttempt {
  provider: string
  model: string
  confidence: number
  accepted: boolean
  failReason?: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface SmartRouterRun {
  id: string
  at: string
  promptPreview: string
  complexity: number
  tier: string
  startRung: number
  finalModel: string
  finalProvider: string
  escalations: number
  attempts: SmartRouterAttempt[]
  costUsd: number
  baselineCostUsd: number
  savedUsd: number
}

export interface SmartRouterSavings {
  days: number
  runs: number
  actualCostUsd: number
  baselineCostUsd: number
  savedUsd: number
  savedPct: number
  escalatedRuns: number
  escalationRate: number
  byModel: Record<string, { runs: number; costUsd: number }>
  daily: Array<{ date: string; costUsd: number; baselineCostUsd: number; savedUsd: number; runs: number }>
  recent: SmartRouterRun[]
}

export function createSmartRouterApi(client: OpenAgentsClient) {
  return {
    getPolicy: () => client.get<SmartRouterPolicy>('/api/v1/smart-router/policy'),
    setPolicy: (policy: Partial<SmartRouterPolicy>) => client.put<SmartRouterPolicy>('/api/v1/smart-router/policy', policy),
    preview: (prompt: string, toolCount?: number) => client.post<SmartRouterPreview>('/api/v1/smart-router/preview', { prompt, toolCount }),
    run: (input: { prompt: string; system?: string; expectJson?: boolean }) =>
      client.post<{ answer: string; accepted: boolean; run: SmartRouterRun }>('/api/v1/smart-router/run', input),
    savings: (days = 30) => client.get<SmartRouterSavings>(`/api/v1/smart-router/savings?days=${days}`),
  }
}
