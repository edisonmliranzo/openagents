import type { WorkflowStep } from './workflow'

export type PlaybookTargetKind = 'agent_prompt' | 'workflow'
export type PlaybookRunStatus = 'running' | 'done' | 'error'
export type PlaybookParamType = 'text' | 'number' | 'boolean'

export interface PlaybookParameter {
  key: string
  label: string
  type: PlaybookParamType
  required: boolean
  description?: string
  defaultValue?: string | number | boolean
}

export interface PlaybookWorkflowTemplate {
  name?: string
  steps: WorkflowStep[]
}

export interface PlaybookDefinition {
  id: string
  userId: string
  name: string
  description: string | null
  targetKind: PlaybookTargetKind
  parameterSchema: PlaybookParameter[]
  promptTemplate: string | null
  workflowTemplate: PlaybookWorkflowTemplate | null
  createdAt: string
  updatedAt: string
}

export interface PlaybookRun {
  id: string
  playbookId: string
  userId: string
  status: PlaybookRunStatus
  startedAt: string
  finishedAt: string | null
  input: Record<string, unknown>
  outputSummary: string | null
  error: string | null
  conversationId?: string
  workflowRunId?: string
}

export interface CreatePlaybookInput {
  name: string
  description?: string | null
  targetKind: PlaybookTargetKind
  parameterSchema?: PlaybookParameter[]
  promptTemplate?: string | null
  workflowTemplate?: PlaybookWorkflowTemplate | null
}

export interface UpdatePlaybookInput {
  name?: string
  description?: string | null
  targetKind?: PlaybookTargetKind
  parameterSchema?: PlaybookParameter[]
  promptTemplate?: string | null
  workflowTemplate?: PlaybookWorkflowTemplate | null
}

export interface RunPlaybookInput {
  params?: Record<string, unknown>
}
