export type HandoffStatus = 'open' | 'claimed' | 'resolved' | 'returned'

export interface HandoffContextMessage {
  id: string
  role: 'user' | 'agent' | 'tool' | 'system'
  status: 'pending' | 'streaming' | 'done' | 'error'
  content: string
  createdAt: string
}

export interface HandoffContextApproval {
  id: string
  toolName: string
  status: 'pending' | 'approved' | 'denied'
  createdAt: string
}

export interface HandoffContextSnapshot {
  conversationTitle: string | null
  latestMessages: HandoffContextMessage[]
  pendingApprovals: HandoffContextApproval[]
  memoryContext: string
  capturedAt: string
}

export interface HandoffOperatorReply {
  id: string
  operatorUserId: string
  messageId: string
  message: string
  createdAt: string
}

export interface HumanHandoffTicket {
  id: string
  userId: string
  conversationId: string
  status: HandoffStatus
  reason: string | null
  createdAt: string
  updatedAt: string
  claimedByUserId: string | null
  claimedAt: string | null
  resolvedAt: string | null
  returnedAt: string | null
  resolutionNote: string | null
  context: HandoffContextSnapshot
  replies: HandoffOperatorReply[]
}

export interface CreateHandoffInput {
  conversationId: string
  reason?: string
}

export interface ReplyHandoffInput {
  message: string
}

export interface ResolveHandoffInput {
  resolutionNote?: string
}
