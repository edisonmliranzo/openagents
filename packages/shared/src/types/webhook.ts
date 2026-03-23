// Webhook event types
export type WebhookEventType =
  | 'agent.run.completed'
  | 'agent.run.failed'
  | 'approval.pending'
  | 'approval.approved'
  | 'approval.denied'
  | 'tool.executed'
  | 'tool.failed'
  | 'conversation.started'
  | 'conversation.message'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'memory.created'
  | 'memory.updated'
  | 'user.login'
  | 'user.registered'
  | 'error.occurred'

export interface WebhookPayload {
  id: string
  event: WebhookEventType
  timestamp: string
  userId: string
  data: Record<string, unknown>
}

export interface WebhookConfig {
  id: string
  userId: string
  url: string
  events: WebhookEventType[]
  secret?: string
  enabled: boolean
  headers?: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  event: WebhookEventType
  payload: WebhookPayload
  status: 'pending' | 'success' | 'failed' | 'retrying'
  attempts: number
  lastAttemptAt?: string
  responseStatus?: number
  responseBody?: string
  error?: string
  createdAt: string
}

export interface CreateWebhookDto {
  url: string
  events: WebhookEventType[]
  secret?: string
  headers?: Record<string, string>
}

export interface UpdateWebhookDto {
  url?: string
  events?: WebhookEventType[]
  secret?: string
  enabled?: boolean
  headers?: Record<string, string>
}

export interface WebhookDeliveryStats {
  total: number
  success: number
  failed: number
  pending: number
  successRate: number
}
