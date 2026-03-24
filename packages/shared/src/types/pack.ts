import type { CreateAgentPresetInput } from './agent-preset'
import type { CreateArtifactTemplateInput } from './artifact'
import type { PolicyDecision, PolicyScope } from './policy'
import type { SkillManifest } from './skill-registry'
import type { CreateWorkflowInput } from './workflow'

export type PackVisibility = 'private' | 'workspace' | 'public'

export interface PackPolicyTemplate {
  id: string
  name: string
  description?: string
  defaultDecision: PolicyDecision
  approvalScopes: PolicyScope[]
  blockedTools: string[]
  requireApprovalTools: string[]
}

export interface PackPresetTemplate {
  sourceId: string
  preset: CreateAgentPresetInput
}

export interface PackWorkflowTemplate {
  sourceId: string
  workflow: CreateWorkflowInput
}

export interface PackArtifactTemplateTemplate {
  sourceId: string
  template: CreateArtifactTemplateInput
}

export interface PackManifest {
  skills: SkillManifest[]
  presets: PackPresetTemplate[]
  workflows: PackWorkflowTemplate[]
  artifactTemplates: PackArtifactTemplateTemplate[]
  policies: PackPolicyTemplate[]
}

export interface PackBundle {
  id: string
  userId: string
  workspaceId?: string
  slug: string
  name: string
  description?: string
  version: string
  visibility: PackVisibility
  tags: string[]
  installCount: number
  manifest: PackManifest
  createdAt: string
  updatedAt: string
}

export interface CreatePackInput {
  workspaceId?: string
  name: string
  description?: string
  version?: string
  visibility?: PackVisibility
  tags?: string[]
  skillIds?: string[]
  presetIds?: string[]
  workflowIds?: string[]
  artifactTemplateIds?: string[]
  policies?: PackPolicyTemplate[]
}

export interface SearchPacksInput {
  q?: string
  tag?: string
  visibility?: PackVisibility
  limit?: number
}

export interface PackInstallPreview {
  packId: string
  installable: boolean
  missingTools: string[]
  counts: {
    skills: number
    presets: number
    workflows: number
    artifactTemplates: number
    policies: number
  }
}

export interface PackInstallResult {
  ok: true
  pack: PackBundle
  installed: {
    skills: string[]
    presetIds: string[]
    workflowIds: string[]
    artifactTemplateIds: string[]
  }
  installedAt: string
}
