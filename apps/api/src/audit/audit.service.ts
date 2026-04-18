import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { RuntimeEvent } from '../events/runtime-event.types'

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

  async list(userId: string, take = 50) {
    const entries = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take,
    })
    return entries.map((e) => ({
      ...e,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }))
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
