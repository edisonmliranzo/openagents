export type WorkflowTriggerKind = 'manual' | 'schedule' | 'webhook' | 'inbox_event'
export type WorkflowStepType =
  | 'agent_prompt'
  | 'tool_call'
  | 'delay'
  | 'run_agent'
  | 'run_tool'
  | 'wait_approval'
  | 'branch_condition'
  | 'set_state'
export type WorkflowRunStatus = 'queued' | 'running' | 'waiting_approval' | 'done' | 'error'
export type WorkflowBranchSource =
  | 'last_output'
  | 'trigger_kind'
  | 'workflow_name'
  | 'run_input'
  | 'state'

export interface WorkflowTrigger {
  kind: WorkflowTriggerKind
  everyMinutes?: number
  webhookSecret?: string
  eventName?: string
}

export interface WorkflowStep {
  id: string
  type: WorkflowStepType
  label: string
  prompt?: string
  toolName?: string
  input?: Record<string, unknown>
  statePatch?: Record<string, unknown>
  delayMs?: number
  conversationId?: string
  retryAttempts?: number
  continueOnError?: boolean
  outputKey?: string
  approvalKey?: string
  approvalReason?: string
  conditionSource?: WorkflowBranchSource
  conditionPath?: string
  conditionOperator?: 'contains' | 'not_contains' | 'equals' | 'not_equals'
  conditionValue?: string
  ifTrueStepId?: string
  ifFalseStepId?: string
}

export interface WorkflowDefinition {
  id: string
  userId: string
  name: string
  description: string | null
  enabled: boolean
  version: number
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
  attemptCount?: number
  stateWrites?: string[]
  nextStepId?: string | null
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
  idempotencyKey?: string
  sourceEvent?: string
  input?: Record<string, unknown>
  state?: Record<string, unknown>
  rerunOfRunId?: string
  resumeStepId?: string | null
  lastOutput?: unknown
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
  idempotencyKey?: string
  approvedKeys?: string[]
  sourceEvent?: string
  input?: Record<string, unknown>
}
