export interface RuntimeEventActor {
  type: 'user' | 'agent' | 'system'
  id?: string | null
}

export interface RuntimeEventResource {
  type: string
  id?: string | null
}

export interface RuntimeEvent {
  name: string
  userId: string
  occurredAt?: string
  conversationId?: string | null
  runId?: string | null
  approvalId?: string | null
  workflowId?: string | null
  actor?: RuntimeEventActor
  resource?: RuntimeEventResource
  payload?: Record<string, unknown>
}
