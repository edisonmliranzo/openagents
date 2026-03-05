export interface ApprovalJobData {
  approvalId: string
  approved: boolean
  conversationId: string
  userId: string
  toolName: string
  toolInput: Record<string, unknown>
}

export interface ApprovalDeadLetterJobData {
  approvalId: string
  conversationId: string
  userId: string
  toolName: string
  toolInput: Record<string, unknown>
  attemptsMade: number
  failedReason: string
  failedAt: string
}

export interface ExtractionJobData {
  extractionId: string
  requestedBy: string | null
}

export interface CiHealerJobData {
  incidentId: string
  source: 'webhook' | 'manual'
}

export interface WorkflowRunJobData {
  userId: string
  workflowId: string
  runId: string
  triggerKind: 'manual' | 'schedule' | 'webhook' | 'inbox_event'
  idempotencyKey?: string
  sourceEvent?: string
  approvedKeys?: string[]
  input?: Record<string, unknown>
}
