import { Injectable } from '@nestjs/common'
import type { PolicyDecision, PolicyEvaluationInput, PolicyEvaluationResult, PolicyRiskFactor } from '@openagents/shared'

@Injectable()
export class PolicyService {
  evaluate(input: PolicyEvaluationInput): PolicyEvaluationResult {
    const action = (input.action ?? '').trim()
    const toolName = (input.toolName ?? '').trim()
    const scope = input.scope ?? 'local'
    const sensitivity = input.sensitivity ?? 'internal'
    const estimatedCostUsd = Number.isFinite(input.estimatedCostUsd ?? NaN)
      ? Number(input.estimatedCostUsd)
      : 0

    let riskScore = 5
    const factors: PolicyRiskFactor[] = []

    const scopeScores: Record<string, number> = {
      local: 0,
      external_read: 10,
      external_write: 28,
      system_mutation: 40,
    }
    const scopeScore = scopeScores[scope] ?? 0
    if (scopeScore > 0) {
      factors.push({
        label: 'scope',
        score: scopeScore,
        reason: `Action scope is ${scope}.`,
      })
      riskScore += scopeScore
    }

    const sensitivityScores: Record<string, number> = {
      public: 0,
      internal: 8,
      confidential: 20,
      restricted: 35,
    }
    const sensitivityScore = sensitivityScores[sensitivity] ?? 8
    if (sensitivityScore > 0) {
      factors.push({
        label: 'sensitivity',
        score: sensitivityScore,
        reason: `Data sensitivity is ${sensitivity}.`,
      })
      riskScore += sensitivityScore
    }

    if (estimatedCostUsd >= 100) {
      factors.push({
        label: 'cost',
        score: 20,
        reason: `Estimated cost is ${estimatedCostUsd.toFixed(2)} USD.`,
      })
      riskScore += 20
    } else if (estimatedCostUsd >= 25) {
      factors.push({
        label: 'cost',
        score: 10,
        reason: `Estimated cost is ${estimatedCostUsd.toFixed(2)} USD.`,
      })
      riskScore += 10
    }

    if (input.reversible === false) {
      factors.push({
        label: 'reversibility',
        score: 14,
        reason: 'Action appears irreversible.',
      })
      riskScore += 14
    }

    const actionFingerprint = `${action} ${toolName}`.toLowerCase()
    if (/(delete|remove|revoke|drop|shutdown|terminate|wipe)/i.test(actionFingerprint)) {
      factors.push({
        label: 'destructive_intent',
        score: 24,
        reason: 'Action contains destructive verbs.',
      })
      riskScore += 24
    }

    if (/(secret|token|password|api key|credential|private key)/i.test(actionFingerprint)) {
      factors.push({
        label: 'credential_touch',
        score: 25,
        reason: 'Action suggests credential handling.',
      })
      riskScore += 25
    }

    riskScore = Math.max(0, Math.min(100, riskScore))
    // Owner-only self-hosted install — only block truly dangerous actions (block ≥ 90, confirm ≥ 75)
    const decision: PolicyDecision = riskScore >= 90 ? 'block' : riskScore >= 75 ? 'confirm' : 'auto'

    const strongest = [...factors].sort((a, b) => b.score - a.score)[0]
    const reason = strongest?.reason ?? 'Low-risk local action.'

    return {
      riskScore,
      decision,
      reason,
      factors,
      evaluatedAt: new Date().toISOString(),
    }
  }
}
