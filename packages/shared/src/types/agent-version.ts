// Agent template and version control types
export interface AgentTemplate {
  id: string
  userId: string
  name: string
  description: string
  version: string
  config: AgentTemplateConfig
  parentTemplateId?: string
  tags: string[]
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentTemplateConfig {
  systemPrompt: string
  model: string
  provider: string
  tools: string[]
  autonomyLevel: 'low' | 'medium' | 'high' | 'full'
  maxToolRounds: number
  timeoutMs: number
  retryAttempts: number
  memoryFiles: string[]
  customSettings?: Record<string, unknown>
}

export interface AgentTemplateDiff {
  id: string
  baseVersion: string
  targetVersion: string
  changes: ConfigChange[]
  createdAt: string
}

export interface ConfigChange {
  path: string
  oldValue: unknown
  newValue: unknown
  changeType: 'added' | 'removed' | 'modified'
}

export interface TemplateBranch {
  id: string
  templateId: string
  name: string
  description?: string
  baseVersion: string
  currentVersion: string
  status: 'active' | 'merged' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface TemplateComparison {
  baseTemplate: AgentTemplate
  targetTemplate: AgentTemplate
  diff: AgentTemplateDiff
  warnings: string[]
  compatibilityScore: number
}

// Web app compatibility exports
export interface AgentVersionDiffEntry {
  path: string
  oldValue: unknown
  newValue: unknown
  before?: unknown
  after?: unknown
  changeType: 'added' | 'removed' | 'modified'
}

export interface AgentVersionSnapshot {
  id: string
  version: string
  config: AgentTemplateConfig
  createdAt: string
  label?: string
  note?: string
  settings: {
    preferredProvider?: string
    preferredModel?: string
    customSystemPrompt?: string
  }
  runtimeConfig: {
    enabled?: boolean
    shadowMode?: boolean
    maxLoopSteps?: number
    runtimeLabel?: string
  }
  skills: Array<{
    id: string
    name: string
    title: string
    enabled: boolean
    tools: string[]
  }>
}
