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

export interface LineageGraphNode {
  id: string
  kind: 'message' | 'tool' | 'approval' | 'memory_file' | 'external_source' | 'note'
  label: string
  metadata?: Record<string, unknown>
}

export interface LineageGraphEdge {
  from: string
  to: string
  label: string
}

export interface ConversationLineageGraph {
  conversationId: string
  nodes: LineageGraphNode[]
  edges: LineageGraphEdge[]
  generatedAt: string
}
