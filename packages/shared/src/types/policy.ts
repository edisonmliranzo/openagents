export type PolicyDecision = 'auto' | 'confirm' | 'block'
export type PolicyScope = 'local' | 'external_read' | 'external_write' | 'system_mutation'
export type PolicySensitivity = 'public' | 'internal' | 'confidential' | 'restricted'

export interface PolicyEvaluationInput {
  action: string
  toolName?: string
  scope?: PolicyScope
  estimatedCostUsd?: number
  sensitivity?: PolicySensitivity
  reversible?: boolean
  metadata?: Record<string, unknown>
}

export interface PolicyRiskFactor {
  label: string
  score: number
  reason: string
}

export interface PolicyEvaluationResult {
  riskScore: number
  decision: PolicyDecision
  reason: string
  factors: PolicyRiskFactor[]
  evaluatedAt: string
}
