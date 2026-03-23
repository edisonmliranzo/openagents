// Agent version types for agent versioning
export interface AgentVersionSnapshot {
  id: string
  version: string
  config: Record<string, unknown>
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
    description: string
    enabled: boolean
    tools: string[]
    promptAppendix?: string
  }>
}

export interface AgentVersionDiffEntry {
  path: string
  oldValue: string
  newValue: string
  before?: string
  after?: string
  changeType: 'added' | 'removed' | 'modified'
}
