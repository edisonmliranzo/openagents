import type { OpenAgentsClient } from '../client'
import type {
  CronHealthSummary,
  CronSelfHealInput,
  CronSelfHealReport,
  NanobotBusEvent,
  NanobotCronTriggerInput,
  NanobotHealth,
  NanobotMarketplaceExportInput,
  NanobotMarketplaceExportResult,
  NanobotMarketplaceInstallResult,
  NanobotMarketplacePack,
  NanobotPersonaProfile,
  NanobotPersonalityState,
  NanobotPresenceTickResult,
  NanobotRuntimeConfig,
  NanobotSkillState,
  NanobotTrustSnapshot,
  UpdateNanobotConfigInput,
} from '@openagents/shared'

export function createNanobotApi(client: OpenAgentsClient) {
  return {
    health: () => client.get<NanobotHealth>('/api/v1/nanobot/health'),

    listEvents: (limit = 60) =>
      client.get<NanobotBusEvent[]>(`/api/v1/nanobot/events?limit=${limit}`),

    listSkills: () => client.get<NanobotSkillState[]>('/api/v1/nanobot/skills'),

    listPersonaProfiles: () =>
      client.get<NanobotPersonaProfile[]>('/api/v1/nanobot/persona/profiles'),

    setPersonaProfile: (profileId: string) =>
      client.patch<NanobotPersonalityState>('/api/v1/nanobot/persona/profile', { profileId }),

    setPersonaBoundaries: (boundaries: string[]) =>
      client.patch<NanobotPersonalityState>('/api/v1/nanobot/persona/boundaries', { boundaries }),

    enableSkill: (skillId: string) =>
      client.post<NanobotSkillState[]>(`/api/v1/nanobot/skills/${skillId}/enable`),

    disableSkill: (skillId: string) =>
      client.post<NanobotSkillState[]>(`/api/v1/nanobot/skills/${skillId}/disable`),

    updateConfig: (input: UpdateNanobotConfigInput) =>
      client.patch<NanobotRuntimeConfig>('/api/v1/nanobot/config', input),

    heartbeat: () => client.post<{ userId: string; tickedAt: string }>('/api/v1/nanobot/heartbeat'),

    tickPresence: () =>
      client.post<NanobotPresenceTickResult>('/api/v1/nanobot/presence/tick'),

    triggerCron: (input: NanobotCronTriggerInput) =>
      client.post<{ jobName: string; userId: string; source: string; triggeredAt: string }>(
        '/api/v1/nanobot/cron/trigger',
        input,
      ),

    cronHealth: (staleAfterMinutes?: number) =>
      client.get<CronHealthSummary>(
        `/api/v1/nanobot/cron/health${staleAfterMinutes ? `?staleAfterMinutes=${staleAfterMinutes}` : ''}`,
      ),

    cronSelfHeal: (input: CronSelfHealInput = {}) =>
      client.post<CronSelfHealReport>('/api/v1/nanobot/cron/self-heal', input),

    listMarketplacePacks: () =>
      client.get<NanobotMarketplacePack[]>('/api/v1/nanobot/marketplace/packs'),

    installMarketplacePack: (packId: string) =>
      client.post<NanobotMarketplaceInstallResult>(`/api/v1/nanobot/marketplace/packs/${packId}/install`),

    exportMarketplacePack: (input: NanobotMarketplaceExportInput) =>
      client.post<NanobotMarketplaceExportResult>('/api/v1/nanobot/marketplace/export', input),

    trust: () => client.get<NanobotTrustSnapshot>('/api/v1/nanobot/trust'),
  }
}
