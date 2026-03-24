import type { PolicyDecision, PolicyScope } from './policy'

export type AgentPresetVisibility = 'private' | 'workspace' | 'public'
export type AgentAutonomyMode = 'assist' | 'copilot' | 'autonomous'

export interface AgentPresetPolicyProfile {
  defaultDecision: PolicyDecision
  approvalScopes: PolicyScope[]
  blockedTools: string[]
  requireApprovalTools: string[]
  maxAutonomySteps?: number
}

export interface AgentPresetSettings {
  preferredProvider?: string
  preferredModel?: string
  customSystemPrompt?: string
}

export interface AgentPreset {
  id: string
  userId: string
  workspaceId?: string
  name: string
  description?: string
  role: string
  outputStyle?: string
  autonomyMode: AgentAutonomyMode
  visibility: AgentPresetVisibility
  version: number
  settings: AgentPresetSettings
  enabledSkills: string[]
  tools: string[]
  connectorIds: string[]
  suggestedWorkflowIds: string[]
  policy: AgentPresetPolicyProfile
  createdAt: string
  updatedAt: string
  lastAppliedAt?: string
  appliedCount: number
}

export interface CreateAgentPresetInput {
  workspaceId?: string
  name: string
  description?: string
  role?: string
  outputStyle?: string
  autonomyMode?: AgentAutonomyMode
  visibility?: AgentPresetVisibility
  settings?: AgentPresetSettings
  enabledSkills?: string[]
  tools?: string[]
  connectorIds?: string[]
  suggestedWorkflowIds?: string[]
  policy?: Partial<AgentPresetPolicyProfile>
}

export interface UpdateAgentPresetInput {
  workspaceId?: string | null
  name?: string
  description?: string | null
  role?: string
  outputStyle?: string | null
  autonomyMode?: AgentAutonomyMode
  visibility?: AgentPresetVisibility
  settings?: AgentPresetSettings
  enabledSkills?: string[]
  tools?: string[]
  connectorIds?: string[]
  suggestedWorkflowIds?: string[]
  policy?: Partial<AgentPresetPolicyProfile>
}

export interface ApplyAgentPresetInput {
  conversationId?: string
}

export interface ApplyAgentPresetResult {
  ok: true
  preset: AgentPreset
  appliedSkills: string[]
  settings: AgentPresetSettings
  appliedAt: string
}
