import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { RuntimeEvent } from '../events/runtime-event.types'

export interface AuditListFilters {
  action?: string
  tool?: string
  from?: string
  to?: string
}

/** Actions whose previous state is captured in metadata.previous and can be safely restored. */
const REVERSIBLE_ACTIONS = new Set(['memory_update', 'memory_delete', 'memory_pin', 'memory_unpin'])

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        category: 'system',
        action,
        resource: `${resourceType}:${resourceId}`,
        severity: 'low',
        description: action,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })
  }

  async logEvent(event: RuntimeEvent) {
    const resourceType = event.resource?.type || this.inferResourceType(event.name)
    const resourceId =
      event.resource?.id
      ?? event.approvalId
      ?? event.runId
      ?? event.workflowId
      ?? event.conversationId
      ?? `${event.name}:${event.occurredAt ?? new Date().toISOString()}`

    return this.log(
      event.userId,
      event.name.replace(/\./g, '_'),
      resourceType,
      resourceId,
      {
        occurredAt: event.occurredAt ?? new Date().toISOString(),
        conversationId: event.conversationId ?? null,
        runId: event.runId ?? null,
        approvalId: event.approvalId ?? null,
        workflowId: event.workflowId ?? null,
        actor: event.actor ?? null,
        payload: event.payload ?? {},
      },
    )
  }

  async list(userId: string, take = 50, filters: AuditListFilters = {}) {
    const where: Record<string, unknown> = { userId }
    if (filters.action) where.action = { contains: filters.action }
    if (filters.tool) {
      where.OR = [
        { resource: { contains: filters.tool } },
        { metadata: { contains: filters.tool } },
      ]
    }
    const timestamp: Record<string, Date> = {}
    const from = filters.from ? new Date(filters.from) : null
    const to = filters.to ? new Date(filters.to) : null
    if (from && !Number.isNaN(from.getTime())) timestamp.gte = from
    if (to && !Number.isNaN(to.getTime())) timestamp.lte = to
    if (Object.keys(timestamp).length) where.timestamp = timestamp

    const entries = await this.prisma.auditLog.findMany({
      where: where as any,
      orderBy: { timestamp: 'desc' },
      take: Math.max(1, Math.min(take, 500)),
    })
    return entries.map((e) => this.toPublic(e))
  }

  async undo(userId: string, id: string) {
    const entry = await this.prisma.auditLog.findFirst({ where: { id, userId } })
    if (!entry) throw new NotFoundException('Audit log not found')
    const metadata = this.parseMetadata(entry.metadata)
    if (!this.isReversible(entry.action, metadata)) {
      return { ok: false, reversible: false, message: 'not reversible' }
    }
    if (metadata?.undoneAt) {
      return { ok: false, reversible: true, message: 'already undone' }
    }

    const memoryId = entry.resource.startsWith('memory:') ? entry.resource.slice('memory:'.length) : ''
    const previous = (metadata?.previous ?? {}) as Record<string, unknown>
    const prevTags = typeof previous.tags === 'string' ? previous.tags : undefined

    const current = memoryId ? await this.prisma.memory.findFirst({ where: { id: memoryId } }) : null
    if (current && current.userId !== userId) throw new NotFoundException('Memory not found')

    if (entry.action === 'memory_delete') {
      if (current) return { ok: false, reversible: true, message: 'memory already exists' }
      const type = previous.type === 'preference' || previous.type === 'summary' ? previous.type : 'fact'
      const createdAt = typeof previous.createdAt === 'string' ? new Date(previous.createdAt) : undefined
      await this.prisma.memory.create({
        data: {
          id: memoryId,
          userId,
          type,
          content: String(previous.content ?? ''),
          tags: prevTags ?? '[]',
          ...(createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt } : {}),
        },
      })
    } else {
      if (!current) return { ok: false, reversible: true, message: 'memory no longer exists' }
      const data: { content?: string; tags?: string } = {}
      if (entry.action === 'memory_update' && typeof previous.content === 'string') data.content = previous.content
      if (prevTags !== undefined) data.tags = prevTags
      await this.prisma.memory.update({ where: { id: current.id }, data })
    }

    const undoneAt = new Date().toISOString()
    await this.prisma.auditLog.update({
      where: { id: entry.id },
      data: { metadata: JSON.stringify({ ...(metadata ?? {}), undoneAt }) },
    })
    await this.log(userId, `${entry.action}_undo`, 'memory', memoryId, { undoOf: entry.id })
    return { ok: true, reversible: true, message: 'undone', undoneAt }
  }

  private isReversible(action: string, metadata: Record<string, unknown> | null) {
    return REVERSIBLE_ACTIONS.has(action) && metadata?.reversible === true && !!metadata.previous
  }

  private parseMetadata(raw: string | null): Record<string, unknown> | null {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  private toPublic(e: {
    id: string
    userId: string
    category: string
    action: string
    resource: string
    severity: string
    description: string
    ipAddress: string | null
    userAgent: string | null
    metadata: string | null
    timestamp: Date
  }) {
    const metadata = this.parseMetadata(e.metadata)
    const sep = e.resource.indexOf(':')
    return {
      ...e,
      metadata,
      resourceType: sep >= 0 ? e.resource.slice(0, sep) : e.resource,
      resourceId: sep >= 0 ? e.resource.slice(sep + 1) : '',
      createdAt: e.timestamp.toISOString(),
      reversible: this.isReversible(e.action, metadata) && !metadata?.undoneAt,
      undoneAt: typeof metadata?.undoneAt === 'string' ? metadata.undoneAt : null,
    }
  }

  private inferResourceType(eventName: string) {
    if (eventName.startsWith('approval.')) return 'approval'
    if (eventName.startsWith('agent.run.')) return 'agent_run'
    if (eventName.startsWith('tool.')) return 'tool'
    if (eventName.startsWith('conversation.')) return 'conversation'
    if (eventName.startsWith('workflow.')) return 'workflow'
    return 'event'
  }
}
