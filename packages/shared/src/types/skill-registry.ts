export interface SkillManifest {
  id: string
  title: string
  description: string
  tools: string[]
  promptAppendix?: string
}

export interface SkillCompatibility {
  minApiVersion?: string
  maxApiVersion?: string
  requiredTools?: string[]
}

export interface SkillRegistryVersion {
  version: string
  changelog: string
  manifest: SkillManifest
  compatibility: SkillCompatibility | null
  signature: string
  publishedAt: string
}

export interface SkillRegistryEntry {
  skillId: string
  title: string
  description: string
  installedVersion: string | null
  versions: SkillRegistryVersion[]
  pinnedAgents: Record<string, string>
  updatedAt: string
  createdAt: string
}

export interface PublishSkillVersionInput {
  skill: SkillManifest
  version: string
  changelog: string
  compatibility?: SkillCompatibility
}

export interface PublishSkillVersionResult {
  entry: SkillRegistryEntry
  created: boolean
}

export interface InstallSkillVersionInput {
  version?: string
  agentId?: string
}

export interface RollbackSkillVersionInput {
  targetVersion?: string
  agentId?: string
}

export interface PinSkillVersionInput {
  agentId: string
  version: string
}
