export interface ApprovalJobData {
  approvalId: string
  approved: boolean
  conversationId: string
  userId: string
  toolName: string
  toolInput: Record<string, unknown>
}
