import type {
  CreateWebhookDto,
  UpdateWebhookDto,
  WebhookConfig,
  WebhookConfigSummary,
  WebhookDelivery,
  WebhookDeliveryStats,
  WebhookEventOption,
  WebhookEventType,
  WebhookRetryResult,
  WebhookTestResult,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

export interface WebhookDeliveriesQuery {
  take?: number
  status?: string
}

interface RawWebhookConfig {
  id: string
  userId: string
  url: string
  events: WebhookEventType[] | string
  secret?: string | null
  enabled: boolean
  headers?: Record<string, string> | string | null
  createdAt: string
  updatedAt: string
  deliveryCount?: number
}

function parseJsonArray<T>(value: T[] | string): T[] {
  if (typeof value !== 'string') {
    return value
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function parseJsonRecord(
  value: Record<string, string> | string | null | undefined,
): Record<string, string> | undefined {
  if (value == null) {
    return undefined
  }

  if (typeof value !== 'string') {
    return value
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, string>
      : undefined
  } catch {
    return undefined
  }
}

function normalizeWebhookConfig(config: RawWebhookConfig): WebhookConfig {
  const headers = parseJsonRecord(config.headers)

  return {
    id: config.id,
    userId: config.userId,
    url: config.url,
    events: parseJsonArray<WebhookEventType>(config.events),
    ...(config.secret ? { secret: config.secret } : {}),
    enabled: config.enabled,
    ...(headers ? { headers } : {}),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}

function normalizeWebhookSummary(config: RawWebhookConfig): WebhookConfigSummary {
  return {
    ...normalizeWebhookConfig(config),
    deliveryCount: config.deliveryCount ?? 0,
  }
}

function buildDeliveriesQuery(query: WebhookDeliveriesQuery = {}) {
  const params = new URLSearchParams()

  if (Number.isFinite(query.take) && Number(query.take) > 0) {
    params.set('take', `${Math.floor(Number(query.take))}`)
  }

  if (query.status?.trim()) {
    params.set('status', query.status.trim())
  }

  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function createWebhooksApi(client: OpenAgentsClient) {
  return {
    list: () =>
      client.get<RawWebhookConfig[]>('/api/v1/webhooks').then((configs) => configs.map(normalizeWebhookSummary)),

    listEventTypes: () => client.get<WebhookEventOption[]>('/api/v1/webhooks/events'),

    get: (id: string) =>
      client.get<RawWebhookConfig | null>(`/api/v1/webhooks/${id}`).then((config) => (
        config ? normalizeWebhookConfig(config) : null
      )),

    create: (input: CreateWebhookDto) =>
      client.post<RawWebhookConfig>('/api/v1/webhooks', input).then(normalizeWebhookConfig),

    update: (id: string, input: UpdateWebhookDto) =>
      client.put<RawWebhookConfig | null>(`/api/v1/webhooks/${id}`, input).then((config) => (
        config ? normalizeWebhookConfig(config) : null
      )),

    remove: (id: string) => client.delete<{ count: number }>(`/api/v1/webhooks/${id}`),

    listDeliveries: (id: string, query: WebhookDeliveriesQuery = {}) =>
      client.get<WebhookDelivery[]>(`/api/v1/webhooks/${id}/deliveries${buildDeliveriesQuery(query)}`),

    getDeliveryStats: (id: string) =>
      client.get<WebhookDeliveryStats | null>(`/api/v1/webhooks/${id}/deliveries/stats`),

    retryDelivery: (id: string, deliveryId: string) =>
      client.post<WebhookRetryResult | null>(`/api/v1/webhooks/${id}/deliveries/${deliveryId}/retry`),

    test: (id: string) =>
      client.post<WebhookTestResult | null>(`/api/v1/webhooks/${id}/test`),
  }
}
