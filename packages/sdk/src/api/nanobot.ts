import type { OpenAgentsClient } from '../client'
import type {
  NanobotBusEvent,
  NanobotCronTriggerInput,
  NanobotHealth,
  NanobotRuntimeConfig,
  NanobotSkillState,
  UpdateNanobotConfigInput,
} from '@openagents/shared'

export function createNanobotApi(client: OpenAgentsClient) {
  return {
    health: () => client.get<NanobotHealth>('/api/v1/nanobot/health'),

    listEvents: (limit = 60) =>
      client.get<NanobotBusEvent[]>(`/api/v1/nanobot/events?limit=${limit}`),

    listSkills: () => client.get<NanobotSkillState[]>('/api/v1/nanobot/skills'),

    enableSkill: (skillId: string) =>
      client.post<NanobotSkillState[]>(`/api/v1/nanobot/skills/${skillId}/enable`),

    disableSkill: (skillId: string) =>
      client.post<NanobotSkillState[]>(`/api/v1/nanobot/skills/${skillId}/disable`),

    updateConfig: (input: UpdateNanobotConfigInput) =>
      client.patch<NanobotRuntimeConfig>('/api/v1/nanobot/config', input),

    heartbeat: () => client.post<{ userId: string; tickedAt: string }>('/api/v1/nanobot/heartbeat'),

    triggerCron: (input: NanobotCronTriggerInput) =>
      client.post<{ jobName: string; userId: string; source: string; triggeredAt: string }>(
        '/api/v1/nanobot/cron/trigger',
        input,
      ),
  }
}
