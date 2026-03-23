import type { OpenAgentsClient } from '../client'
import type {
  InstallSkillVersionInput,
  PinSkillVersionInput,
  PublicSkillCatalogEntry,
  PublishSkillVersionInput,
  PublishSkillVersionResult,
  RollbackSkillVersionInput,
  SearchPublicSkillsInput,
  SkillRegistryEntry,
} from '@openagents/shared'

export function createSkillRegistryApi(client: OpenAgentsClient) {
  const buildPublicQuery = (input: SearchPublicSkillsInput = {}) => {
    const params = new URLSearchParams()
    if (input.q?.trim()) params.set('q', input.q.trim())
    if (input.tool?.trim()) params.set('tool', input.tool.trim())
    if (input.tag?.trim()) params.set('tag', input.tag.trim())
    if (input.featured !== undefined) params.set('featured', String(input.featured))
    if (typeof input.limit === 'number' && Number.isFinite(input.limit)) {
      params.set('limit', String(input.limit))
    }
    const query = params.toString()
    return query ? `?${query}` : ''
  }

  return {
    list: () => client.get<SkillRegistryEntry[]>('/api/v1/skill-registry'),

    get: (skillId: string) =>
      client.get<SkillRegistryEntry>(`/api/v1/skill-registry/${encodeURIComponent(skillId)}`),

    listPublic: (input: SearchPublicSkillsInput = {}) =>
      client.get<PublicSkillCatalogEntry[]>(`/api/v1/skill-registry/public${buildPublicQuery(input)}`),

    publish: (input: PublishSkillVersionInput) =>
      client.post<PublishSkillVersionResult>('/api/v1/skill-registry/publish', input),

    install: (skillId: string, input: InstallSkillVersionInput = {}) =>
      client.post<SkillRegistryEntry>(`/api/v1/skill-registry/${encodeURIComponent(skillId)}/install`, input),

    installPublic: (catalogId: string, input: InstallSkillVersionInput = {}) =>
      client.post<SkillRegistryEntry>(`/api/v1/skill-registry/public/${encodeURIComponent(catalogId)}/install`, input),

    rollback: (skillId: string, input: RollbackSkillVersionInput = {}) =>
      client.post<SkillRegistryEntry>(`/api/v1/skill-registry/${encodeURIComponent(skillId)}/rollback`, input),

    pin: (skillId: string, input: PinSkillVersionInput) =>
      client.post<SkillRegistryEntry>(`/api/v1/skill-registry/${encodeURIComponent(skillId)}/pin`, input),
  }
}
