import type { OpenAgentsClient } from '../client'
import type {
  SkillReputationEntry,
  SkillReputationEvent,
} from '@openagents/shared'

export function createSkillReputationApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<SkillReputationEntry[]>('/api/v1/skill-reputation'),

    history: (skillId: string, days = 30) =>
      client.get<SkillReputationEvent[]>(
        `/api/v1/skill-reputation/${skillId}/history?days=${encodeURIComponent(String(days))}`,
      ),
  }
}
