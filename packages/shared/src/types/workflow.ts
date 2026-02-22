export type WorkflowTriggerKind = 'manual' | 'schedule' | 'webhook'
export type WorkflowStepType = 'agent_prompt' | 'tool_call' | 'delay'
export type WorkflowRunStatus = 'running' | 'done' | 'error'

export interface WorkflowTrigger {
  kind: WorkflowTriggerKind
  everyMinutes?: number
  webhookSecret?: string
}

export interface WorkflowStep {
  id: string
  type: WorkflowStepType
  label: string
  prompt?: string
  toolName?: string
  input?: Record<string, unknown>
  delayMs?: number
  conversationId?: string
}

export interface WorkflowDefinition {
  id: string
  userId: string
  name: string
  description: string | null
  enabled: boolean
  trigger: WorkflowTrigger
  steps: WorkflowStep[]
  createdAt: string
  updatedAt: string
  lastRunAt: string | null
  nextRunAt: string | null
}

export interface WorkflowStepRunResult {
  stepId: string
  type: WorkflowStepType
  status: WorkflowRunStatus
  startedAt: string
  finishedAt: string
  output: string | null
  error: string | null
}

export interface WorkflowRun {
  id: string
  workflowId: string
  userId: string
  triggerKind: WorkflowTriggerKind
  status: WorkflowRunStatus
  startedAt: string
  finishedAt: string | null
  error: string | null
  stepResults: WorkflowStepRunResult[]
}

export interface CreateWorkflowInput {
  name: string
  description?: string | null
  enabled?: boolean
  trigger: WorkflowTrigger
  steps: WorkflowStep[]
}

export interface UpdateWorkflowInput {
  name?: string
  description?: string | null
  enabled?: boolean
  trigger?: WorkflowTrigger
  steps?: WorkflowStep[]
}

export interface RunWorkflowInput {
  triggerKind?: WorkflowTriggerKind
  webhookSecret?: string
}
