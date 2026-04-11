import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TriggerAction, TriggerEventType, TriggerFilter } from '@openagents/shared'
import { NotificationsService } from '../notifications/notifications.service'
import type { RuntimeEvent } from '../events/runtime-event.types'

@Injectable()
export class TriggersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(
    userId: string,
    data: {
      name: string
      description?: string
      event: TriggerEventType
      filter?: TriggerFilter
      actions: { type: string; config: Record<string, unknown> }[]
      workflowId?: string
    },
  ) {
    return this.prisma.trigger.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        event: data.event,
        filter: data.filter ? JSON.stringify(data.filter) : null,
        actions: JSON.stringify(data.actions),
        workflowId: data.workflowId,
        enabled: true,
      },
    })
  }

  async list(userId: string) {
    const triggers = await this.prisma.trigger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    return triggers.map((t) => ({
      id: t.id,
      userId: t.userId,
      name: t.name,
      description: t.description,
      event: t.event,
      filter: t.filter ? JSON.parse(t.filter) : null,
      actions: JSON.parse(t.actions),
      workflowId: t.workflowId,
      enabled: t.enabled,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }))
  }

  async get(id: string, userId: string) {
    const t = await this.prisma.trigger.findFirst({
      where: { id, userId },
    })
    if (!t) return null

    return {
      id: t.id,
      userId: t.userId,
      name: t.name,
      description: t.description,
      event: t.event,
      filter: t.filter ? JSON.parse(t.filter) : null,
      actions: JSON.parse(t.actions),
      workflowId: t.workflowId,
      enabled: t.enabled,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }
  }

  async update(
    id: string,
    userId: string,
    data: {
      name?: string
      description?: string
      enabled?: boolean
      filter?: TriggerFilter
      actions?: { type: string; config: Record<string, unknown> }[]
      workflowId?: string
    },
  ) {
    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.enabled !== undefined) updateData.enabled = data.enabled
    if (data.filter !== undefined) updateData.filter = JSON.stringify(data.filter)
    if (data.actions !== undefined) updateData.actions = JSON.stringify(data.actions)
    if (data.workflowId !== undefined) updateData.workflowId = data.workflowId

    await this.prisma.trigger.updateMany({
      where: { id, userId },
      data: updateData,
    })

    return this.get(id, userId)
  }

  async delete(id: string, userId: string) {
    return this.prisma.trigger.deleteMany({
      where: { id, userId },
    })
  }

  async processEvent(
    eventType: TriggerEventType,
    payload: Record<string, unknown>,
  ) {
    const triggers = await this.prisma.trigger.findMany({
      where: { event: eventType, enabled: true },
    })

    const results = []

    for (const trigger of triggers) {
      const filter = trigger.filter ? JSON.parse(trigger.filter) : null
      const matches = !filter || this.evaluateFilter(filter, payload)
      const eventRecord = await this.prisma.triggerEvent.create({
        data: {
          triggerId: trigger.id,
          userId: trigger.userId,
          event: eventType,
          payload: JSON.stringify(payload),
          status: matches ? 'processing' : 'not_matched',
          matchedTrigger: matches ? trigger.id : null,
          ...(matches ? {} : { processedAt: new Date() }),
        },
      })

      if (!matches) {
        results.push({ triggerId: trigger.id, matched: false, actionsExecuted: 0 })
        continue
      }

      const actions = this.parseActions(trigger.actions)
      const execution = await this.executeActions(trigger.userId, eventType, payload, actions)
      const failed = execution.errors.length > 0

      await this.prisma.triggerEvent.update({
        where: { id: eventRecord.id },
        data: {
          status: failed ? 'failed' : 'completed',
          actionsExecuted: execution.executed,
          error: failed ? execution.errors.join(' ') : null,
          processedAt: new Date(),
        },
      })

      results.push({
        triggerId: trigger.id,
        matched: true,
        actionsExecuted: execution.executed,
        ...(failed ? { error: execution.errors.join(' ') } : {}),
      })
    }

    return results
  }

  async evaluateEvent(event: RuntimeEvent) {
    const eventType = this.toTriggerEventType(event.name)
    if (!eventType) {
      return { evaluated: false, matched: 0, reason: 'unsupported_event' as const }
    }

    const results = await this.processEvent(eventType, {
      ...(event.payload ?? {}),
      eventName: event.name,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      conversationId: event.conversationId ?? null,
      runId: event.runId ?? null,
      approvalId: event.approvalId ?? null,
      workflowId: event.workflowId ?? null,
      resourceType: event.resource?.type ?? null,
      resourceId: event.resource?.id ?? null,
      actorType: event.actor?.type ?? null,
      actorId: event.actor?.id ?? null,
    })

    return {
      evaluated: true,
      matched: results.filter((result) => result.matched).length,
      total: results.length,
    }
  }

  private evaluateFilter(
    filter: TriggerFilter,
    payload: Record<string, unknown>,
  ): boolean {
    const results = filter.conditions.map((condition) => {
      const value = payload[condition.field]
      return this.evaluateCondition(condition, value)
    })

    return filter.operator === 'AND'
      ? results.every(Boolean)
      : results.some(Boolean)
  }

  private evaluateCondition(
    condition: { operator: string; value: unknown },
    actual: unknown,
  ): boolean {
    switch (condition.operator) {
      case 'equals':
        return actual === condition.value
      case 'not_equals':
        return actual !== condition.value
      case 'contains':
        return String(actual).includes(String(condition.value))
      case 'starts_with':
        return String(actual).startsWith(String(condition.value))
      case 'ends_with':
        return String(actual).endsWith(String(condition.value))
      case 'greater_than':
        return Number(actual) > Number(condition.value)
      case 'less_than':
        return Number(actual) < Number(condition.value)
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(actual)
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(actual)
      default:
        return false
    }
  }

  async getTriggerEvents(triggerId: string, userId: string, limit = 50) {
    const trigger = await this.prisma.trigger.findFirst({
      where: { id: triggerId, userId },
    })
    if (!trigger) return []

    const events = await this.prisma.triggerEvent.findMany({
      where: { triggerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return events.map((e) => ({
      id: e.id,
      triggerId: e.triggerId,
      event: e.event,
      payload: JSON.parse(e.payload),
      status: e.status,
      matchedTrigger: e.matchedTrigger,
      actionsExecuted: e.actionsExecuted,
      error: e.error,
      createdAt: e.createdAt.toISOString(),
      processedAt: e.processedAt?.toISOString(),
    }))
  }

  private parseActions(raw: string): TriggerAction[] {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed as TriggerAction[] : []
    } catch {
      return []
    }
  }

  private async executeActions(
    userId: string,
    eventType: TriggerEventType,
    payload: Record<string, unknown>,
    actions: TriggerAction[],
  ) {
    let executed = 0
    const errors: string[] = []

    for (const action of actions) {
      try {
        if (action.type === 'send_message' || action.type === 'create_reminder') {
          const title = this.asString(action.config.title) ?? `Trigger fired: ${eventType}`
          const message =
            this.asString(action.config.message)
            ?? this.asString(action.config.body)
            ?? `Trigger ${eventType} matched.`
          const type = this.asNotificationType(action.config.type)
          await this.notifications.create(userId, title, message, type)
          executed += 1
          continue
        }

        if (action.type === 'call_webhook') {
          const url = this.asString(action.config.url)
          if (!url) {
            errors.push('Trigger action call_webhook requires config.url.')
            continue
          }
          const headers = this.asHeaderRecord(action.config.headers)
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: JSON.stringify({
              event: eventType,
              payload,
              config: action.config,
            }),
          })
          if (!response.ok) {
            errors.push(`Webhook action failed with status ${response.status}.`)
            continue
          }
          executed += 1
          continue
        }

        errors.push(`Unsupported trigger action: ${action.type}.`)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Trigger action failed: ${action.type}`)
      }
    }

    return { executed, errors }
  }

  private toTriggerEventType(eventName: string): TriggerEventType | null {
    const supported: TriggerEventType[] = [
      'email.received',
      'calendar.event_created',
      'calendar.event_updated',
      'calendar.event_reminder',
      'webhook.received',
      'file.created',
      'file.modified',
      'github.pr_opened',
      'github.pr_merged',
      'github.issue_created',
      'slack.message',
      'discord.message',
      'timer.elapsed',
      'approval.pending',
      'approval.approved',
      'approval.denied',
      'approval.completed',
      'conversation.started',
      'conversation.message',
      'tool.executed',
      'tool.failed',
      'workflow.started',
      'workflow.completed',
      'workflow.failed',
      'agent.run.started',
      'agent.run.completed',
      'agent.run.failed',
    ]

    return supported.includes(eventName as TriggerEventType)
      ? eventName as TriggerEventType
      : null
  }

  private asString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null
  }

  private asNotificationType(value: unknown): 'info' | 'warning' | 'success' | 'error' {
    return value === 'warning' || value === 'success' || value === 'error' ? value : 'info'
  }

  private asHeaderRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const out: Record<string, string> = {}
    for (const [key, raw] of Object.entries(value)) {
      if (typeof raw === 'string') out[key] = raw
    }
    return out
  }
}
