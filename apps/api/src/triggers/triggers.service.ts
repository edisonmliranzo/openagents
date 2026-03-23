import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TriggerEventType, TriggerFilter } from '@openagents/shared'

@Injectable()
export class TriggersService {
  constructor(private prisma: PrismaService) {}

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

      if (matches) {
        await this.prisma.triggerEvent.create({
          data: {
            triggerId: trigger.id,
            userId: trigger.userId,
            event: eventType,
            payload: JSON.stringify(payload),
            status: 'matched',
            matchedTrigger: trigger.id,
          },
        })

        results.push({ triggerId: trigger.id, matched: true })
      }
    }

    return results
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
}
