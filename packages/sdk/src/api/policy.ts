import type { OpenAgentsClient } from '../client'
import type { PolicyEvaluationInput, PolicyEvaluationResult } from '@openagents/shared'

export function createPolicyApi(client: OpenAgentsClient) {
  return {
    evaluate: (input: PolicyEvaluationInput) =>
      client.post<PolicyEvaluationResult>('/api/v1/policy/evaluate', input),
  }
}
