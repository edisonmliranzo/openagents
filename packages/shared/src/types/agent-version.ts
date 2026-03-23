// Agent template and version control types
export interface AgentTemplate {
  id: string
  userId: string
  name: string
  description: string
  version: string
  config: AgentConfig
  parentTemplateId?: string
  tags: string[]
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentConfig {
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
