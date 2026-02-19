export type ApprovalStatus = 'pending' | 'approved' | 'denied'

export interface Approval {
  id: string
  conversationId: string
  messageId: string
  userId: string
  toolName: string
  toolInput: Record<string, unknown>
  status: ApprovalStatus
  resolvedAt: string | null
  createdAt: string
}
