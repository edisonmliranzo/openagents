import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AgentService } from '../agent/agent.service'
import { NotificationsService } from '../notifications/notifications.service'
import { TelegramService } from '../channels/telegram/telegram.service'

const VALID_SOURCES = ['email', 'slack', 'github', 'webhook', 'system_metric'] as const
export type ProactiveSource = (typeof VALID_SOURCES)[number]

export interface ProactiveTriggerDto {
  source: ProactiveSource
  condition?: string
  actionText: string
  enabled?: boolean
}

@Injectable()
export class ProactiveAgentService {
  private readonly logger = new Logger(ProactiveAgentService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  async registerTrigger(userId: string, input: ProactiveTriggerDto) {
    const source = String(input.source ?? '').trim().toLowerCase()
    if (!VALID_SOURCES.includes(source as ProactiveSource)) {
      throw new BadRequestException(`Invalid source "${input.source}". Use one of: ${VALID_SOURCES.join(', ')}`)
    }
    const actionText = String(input.actionText ?? '').trim()
    if (!actionText) throw new BadRequestException('actionText is required.')

    return this.prisma.proactiveTrigger.create({
      data: {
        userId,
        source,
        condition: String(input.condition ?? '*').trim() || '*',
        actionText: actionText.slice(0, 2000),
        enabled: input.enabled ?? true,
      },
    })
  }

  async listTriggers(userId: string) {
    return this.prisma.proactiveTrigger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async setTriggerEnabled(userId: string, triggerId: string, enabled: boolean) {
    const existing = await this.prisma.proactiveTrigger.findFirst({ where: { id: triggerId, userId } })
    if (!existing) throw new BadRequestException('Trigger not found.')
    return this.prisma.proactiveTrigger.update({ where: { id: existing.id }, data: { enabled } })
  }

  async deleteTrigger(userId: string, triggerId: string) {
    const existing = await this.prisma.proactiveTrigger.findFirst({ where: { id: triggerId, userId } })
    if (!existing) throw new BadRequestException('Trigger not found.')
    await this.prisma.proactiveTrigger.delete({ where: { id: existing.id } })
    return { ok: true }
  }

  async listLogs(userId: string, limit = 20) {
    return this.prisma.proactiveLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
    })
  }

  /**
   * Webhook entrypoint: match enabled triggers for this source, run the
   * agent for each match, and deliver the reply via in-app notification +
   * Telegram when linked.
   */
  async handleIncomingEvent(source: string, payload: unknown): Promise<{ matched: number; fired: number }> {
    const normalized = String(source ?? '').trim().toLowerCase()
    const triggers = await this.prisma.proactiveTrigger.findMany({
      where: { source: normalized, enabled: true },
    })
    if (triggers.length === 0) return { matched: 0, fired: 0 }

    const eventText = this.safeStringify(payload).toLowerCase()
    let fired = 0
    for (const trigger of triggers) {
      const condition = trigger.condition.trim().toLowerCase()
      const matches = !condition || condition === '*' || eventText.includes(condition)
      if (!matches) {
        await this.prisma.proactiveLog.create({
          data: { triggerId: trigger.id, userId: trigger.userId, event: eventText.slice(0, 500), status: 'skipped' },
        })
        continue
      }
      const ok = await this.dispatch(trigger, eventText).catch((error: any) => {
        this.logger.warn(`Proactive dispatch failed for trigger ${trigger.id}: ${error?.message ?? error}`)
        return false
      })
      if (ok) fired += 1
    }
    return { matched: triggers.length, fired }
  }

  private async dispatch(trigger: { id: string; userId: string; source: string; actionText: string }, eventText: string): Promise<boolean> {
    this.logger.log(`Proactive trigger ${trigger.id} fired (source=${trigger.source}).`)

    const conversation = await this.prisma.conversation.findFirst({
      where: { userId: trigger.userId, title: 'Proactive' },
      orderBy: { createdAt: 'desc' },
    })
    const conversationId = conversation?.id
      ?? (await this.prisma.conversation.create({
        data: { userId: trigger.userId, title: 'Proactive' },
        select: { id: true },
      })).id

    let reply = ''
    await this.agent.run({
      conversationId,
      userId: trigger.userId,
      userMessage: `[Proactive ${trigger.source} event]\n${eventText.slice(0, 3000)}\n\n${trigger.actionText}`,
      emit: (event, data) => {
        if (event === 'message') {
          const row = data as { role?: string; content?: string }
          if (row?.role === 'agent' && row.content) reply = row.content
        }
      },
      systemPromptAppendix: 'This is a proactive background run triggered by an external event. Be concise, actionable, and only surface what matters.',
    })

    await this.prisma.proactiveTrigger.update({
      where: { id: trigger.id },
      data: { lastFiredAt: new Date() },
    })
    await this.prisma.proactiveLog.create({
      data: {
        triggerId: trigger.id,
        userId: trigger.userId,
        event: eventText.slice(0, 500),
        status: 'fired',
        detail: reply.slice(0, 2000) || 'agent run completed',
      },
    })

    if (reply) {
      await this.notifications
        .create(trigger.userId, `Proactive: ${trigger.source}`, reply.slice(0, 300), 'info')
        .catch(() => undefined)
      await this.telegram
        .deliver(trigger.userId, `⚡ ${trigger.source} — ${reply.slice(0, 3500)}`)
        .catch(() => false)
    }
    return true
  }

  private safeStringify(value: unknown): string {
    try {
      return typeof value === 'string' ? value : JSON.stringify(value ?? {})
    } catch {
      return String(value ?? '')
    }
  }
}
