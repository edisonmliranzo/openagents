export type ApprovalStatus = 'pending' | 'approved' | 'denied'

export interface ApprovalRiskSummary {
  level: 'low' | 'medium' | 'high'
  score: number
  reason: string
}

export interface Approval {
  id: string
  conversationId: string
  messageId: string
  userId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolInputPreview?: string
  inputKeys?: string[]
  risk?: ApprovalRiskSummary | null
  requiresApprovalByPolicy?: boolean
  autonomyWithinWindow?: boolean
  status: ApprovalStatus
  resolvedAt: string | null
  createdAt: string
}
