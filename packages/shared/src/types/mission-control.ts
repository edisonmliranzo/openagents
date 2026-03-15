export type MissionControlEventType =
  | 'run'
  | 'tool_call'
  | 'approval'
  | 'workflow_run'
  | 'playbook_run'
  | 'version_change'
  | 'failure'

export type MissionControlEventStatus =
  | 'started'
  | 'success'
  | 'failed'
  | 'pending'
  | 'approved'
  | 'denied'
  | 'info'

export interface MissionControlEvent {
  id: string
  userId: string
  type: MissionControlEventType
  status: MissionControlEventStatus
  source: string
  runId?: string
  conversationId?: string
  approvalId?: string
  createdAt: string
  payload: Record<string, unknown>
}

export interface MissionControlListInput {
  limit?: number
  cursor?: string
  types?: MissionControlEventType[]
  statuses?: MissionControlEventStatus[]
  source?: string
}

export interface MissionControlListResult {
  events: MissionControlEvent[]
  nextCursor: string | null
}

export interface MissionControlHeartbeat {
  now: string
}

export type MissionControlStreamChunk =
  | { event: 'snapshot'; data: MissionControlListResult }
  | { event: 'event'; data: MissionControlEvent }
  | { event: 'heartbeat'; data: MissionControlHeartbeat }
