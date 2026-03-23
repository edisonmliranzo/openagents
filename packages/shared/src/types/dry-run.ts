// Dry run types for workflow simulation
export interface ToolDryRunResult {
  toolName: string
  predictedInput: Record<string, unknown>
  predictedSideEffects: string[]
  estimatedDurationMs: number
  estimatedCost: number
  approvalRequired: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  warnings: string[]
}

export interface DryRunResult {
  id: string
  workflowId: string
  status: 'simulating' | 'completed' | 'failed'
  steps: DryRunStep[]
  totalEstimatedCost: number
  totalEstimatedDurationMs: number
  approvalCount: number
  error?: string
  createdAt: string
}

export interface DryRunStep {
  index: number
  name: string
  type: string
  status: 'pending' | 'simulated' | 'skipped'
  result?: ToolDryRunResult
}
