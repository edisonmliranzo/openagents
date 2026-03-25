import type {
  CreateTriggerDto,
  Trigger,
  TriggerAction,
  TriggerEvent,
  TriggerEventOption,
  TriggerFilter,
  UpdateTriggerDto,
} from '@openagents/shared'
import type { OpenAgentsClient } from '../client'

interface RawTrigger {
  id: string
  userId: string
  name: string
  description?: string | null
  enabled: boolean
  event: Trigger['event']
  filter?: TriggerFilter | string | null
  actions: TriggerAction[] | string
  workflowId?: string | null
  createdAt: string
  updatedAt: string
}

function parseJsonObject<T>(value: T | string | null | undefined): T | undefined {
  if (value == null) {
    return undefined
  }

  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
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

function normalizeTrigger(trigger: RawTrigger): Trigger {
  const filter = parseJsonObject<TriggerFilter>(trigger.filter)

  return {
    id: trigger.id,
    userId: trigger.userId,
    name: trigger.name,
    ...(trigger.description ? { description: trigger.description } : {}),
    enabled: trigger.enabled,
    event: trigger.event,
    ...(filter ? { filter } : {}),
    actions: parseJsonArray<TriggerAction>(trigger.actions),
    ...(trigger.workflowId ? { workflowId: trigger.workflowId } : {}),
    createdAt: trigger.createdAt,
    updatedAt: trigger.updatedAt,
  }
}

export function createTriggersApi(client: OpenAgentsClient) {
  return {
    list: () =>
      client.get<RawTrigger[]>('/api/v1/triggers').then((triggers) => triggers.map(normalizeTrigger)),

    listEventTypes: () => client.get<TriggerEventOption[]>('/api/v1/triggers/events'),

    get: (id: string) =>
      client.get<RawTrigger | null>(`/api/v1/triggers/${id}`).then((trigger) => (
        trigger ? normalizeTrigger(trigger) : null
      )),

    create: (input: CreateTriggerDto) =>
      client.post<RawTrigger>('/api/v1/triggers', input).then(normalizeTrigger),

    update: (id: string, input: UpdateTriggerDto) =>
      client.put<RawTrigger | null>(`/api/v1/triggers/${id}`, input).then((trigger) => (
        trigger ? normalizeTrigger(trigger) : null
      )),

    remove: (id: string) => client.delete<{ count: number }>(`/api/v1/triggers/${id}`),

    listHistory: (id: string, limit = 50) =>
      client.get<TriggerEvent[]>(`/api/v1/triggers/${id}/events?limit=${Math.max(1, Math.floor(limit))}`),
  }
}
