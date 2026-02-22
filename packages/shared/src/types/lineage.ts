export type LineageToolStatus = 'executed' | 'failed' | 'pending_approval'

export interface LineageToolInfluence {
  toolName: string
  status: LineageToolStatus
  requiresApproval: boolean
  approvalId?: string
  input?: Record<string, unknown>
  outputPreview?: string | null
  error?: string | null
}

export interface DataLineageRecord {
  id: string
  userId: string
  conversationId: string
  messageId: string
  source: 'agent' | 'approval' | 'workflow' | 'playbook' | 'system'
  runId?: string
  createdAt: string
  memoryFiles: string[]
  memorySummaryIds: string[]
  tools: LineageToolInfluence[]
  approvals: string[]
  externalSources: string[]
  notes: string[]
}

export interface CreateDataLineageInput {
  userId: string
  conversationId: string
  messageId: string
  source: DataLineageRecord['source']
  runId?: string
  memoryFiles?: string[]
  memorySummaryIds?: string[]
  tools?: LineageToolInfluence[]
  approvals?: string[]
  externalSources?: string[]
  notes?: string[]
}
