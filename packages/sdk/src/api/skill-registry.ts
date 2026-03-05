import type { OpenAgentsClient } from '../client'
import type {
  InstallSkillVersionInput,
  PinSkillVersionInput,
  PublishSkillVersionInput,
  PublishSkillVersionResult,
  RollbackSkillVersionInput,
  SkillRegistryEntry,
} from '@openagents/shared'

export function createSkillRegistryApi(client: OpenAgentsClient) {
  return {
    list: () => client.get<SkillRegistryEntry[]>('/api/v1/skill-registry'),

    get: (skillId: string) =>
      client.get<SkillRegistryEntry>(`/api/v1/skill-registry/${encodeURIComponent(skillId)}`),

    publish: (input: PublishSkillVersionInput) =>
      client.post<PublishSkillVersionResult>('/api/v1/skill-registry/publish', input),

    install: (skillId: string, input: InstallSkillVersionInput = {}) =>
      client.post<SkillRegistryEntry>(`/api/v1/skill-registry/${encodeURIComponent(skillId)}/install`, input),

    rollback: (skillId: string, input: RollbackSkillVersionInput = {}) =>
      client.post<SkillRegistryEntry>(`/api/v1/skill-registry/${encodeURIComponent(skillId)}/rollback`, input),

    pin: (skillId: string, input: PinSkillVersionInput) =>
      client.post<SkillRegistryEntry>(`/api/v1/skill-registry/${encodeURIComponent(skillId)}/pin`, input),
  }
}
