// Event-driven triggers types for workflow automation
export type TriggerEventType =
  | 'email.received'
  | 'calendar.event_created'
  | 'calendar.event_updated'
  | 'calendar.event_reminder'
  | 'webhook.received'
  | 'file.created'
  | 'file.modified'
  | 'github.pr_opened'
  | 'github.pr_merged'
  | 'github.issue_created'
  | 'slack.message'
  | 'discord.message'
  | 'timer.elapsed'
  | 'approval.completed'

export interface TriggerAction {
  type: 'start_workflow' | 'send_message' | 'update_record' | 'call_webhook' | 'create_reminder'
  config: Record<string, unknown>
}

export interface Trigger {
  id: string
  userId: string
  name: string
  description?: string
  enabled: boolean
  event: TriggerEventType
  filter?: TriggerFilter
  actions: TriggerAction[]
  workflowId?: string
  createdAt: string
  updatedAt: string
}

export interface TriggerFilter {
  conditions: FilterCondition[]
  operator: 'AND' | 'OR'
}

export interface FilterCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'in' | 'not_in'
  value: string | number | boolean | string[] | number[]
}

export interface TriggerEvent {
  id: string
  triggerId: string
  event: TriggerEventType
  payload: Record<string, unknown>
  status: 'received' | 'processing' | 'matched' | 'not_matched' | 'completed' | 'failed'
  matchedTrigger?: string
  actionsExecuted?: number
  error?: string
  createdAt: string
  processedAt?: string
}

export interface TriggerEventOption {
  value: TriggerEventType
  label: string
}

export interface CreateTriggerDto {
  name: string
  description?: string
  event: TriggerEventType
  filter?: TriggerFilter
  actions: TriggerAction[]
  workflowId?: string
}

export interface UpdateTriggerDto {
  name?: string
  description?: string
  enabled?: boolean
  filter?: TriggerFilter
  actions?: TriggerAction[]
  workflowId?: string
}
