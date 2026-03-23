// Workflow debugger types for step-through debugging
export interface WorkflowDebugSession {
  id: string
  workflowId: string
  userId: string
  status: 'active' | 'paused' | 'completed' | 'terminated'
  currentStepIndex: number
  steps: WorkflowDebugStep[]
  variables: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkflowDebugStep {
  index: number
  name: string
  type: 'trigger' | 'action' | 'condition' | 'loop' | 'approval' | 'transform' | 'output'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'breakpoint'
  input: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
  durationMs?: number
  breakpoints: Breakpoint[]
  createdAt: string
}

export interface Breakpoint {
  id: string
  stepIndex: number
  type: 'before' | 'after' | 'on_error'
  enabled: boolean
  condition?: string
}

export interface DebugVariable {
  name: string
  value: unknown
  type: string
  scope: 'global' | 'step' | 'workflow'
}

export interface DebugCommand {
  type: 'step' | 'continue' | 'pause' | 'stop' | 'restart' | 'set_breakpoint' | 'remove_breakpoint' | 'inspect_variable' | 'set_variable'
  stepIndex?: number
  breakpointId?: string
  variableName?: string
  variableValue?: unknown
}

export interface DebugEvent {
  id: string
  sessionId: string
  type: 'step_started' | 'step_completed' | 'step_failed' | 'breakpoint_hit' | 'variable_changed' | 'error'
  stepIndex: number
  data: Record<string, unknown>
  timestamp: string
}
