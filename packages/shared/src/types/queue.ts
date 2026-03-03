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
