import type { OpenAgentsClient } from '../client'
import type {
  AgentBriefing,
  AgentFeatureId,
  AgentGoal,
  AgentLabsSnapshot,
  AgentSafetyTier,
  CreateGoalInput,
  SetSafetyTierInput,
  ToggleFeatureInput,
  UpdateGoalInput,
} from '@openagents/shared'

export function createLabsApi(client: OpenAgentsClient) {
  return {
    snapshot: () => client.get<AgentLabsSnapshot>('/api/v1/labs'),

    toggleFeature: (featureId: AgentFeatureId, input: ToggleFeatureInput) =>
      client.patch<AgentLabsSnapshot>(`/api/v1/labs/features/${featureId}`, input),

    setSafetyTier: (input: SetSafetyTierInput) =>
      client.patch<AgentLabsSnapshot>('/api/v1/labs/safety-tier', input),

    createGoal: (input: CreateGoalInput) =>
      client.post<AgentGoal>('/api/v1/labs/goals', input),

    updateGoal: (goalId: string, input: UpdateGoalInput) =>
      client.patch<AgentGoal>(`/api/v1/labs/goals/${goalId}`, input),

    deleteGoal: (goalId: string) =>
      client.delete<{ ok: true }>(`/api/v1/labs/goals/${goalId}`),

    briefing: () => client.post<AgentBriefing>('/api/v1/labs/briefing'),

    logDecision: (input: {
      summary: string
      options: string[]
      selected: string
      risk: 'low' | 'medium' | 'high'
      confidence: number
    }) => client.post<AgentLabsSnapshot>('/api/v1/labs/decision-journal', input),
  }
}

