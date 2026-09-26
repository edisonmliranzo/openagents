import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { GoalService } from '../goals/goal.service'
import { NotificationsService } from '../notifications/notifications.service'
import { TelegramService } from '../channels/telegram/telegram.service'
import type { LLMProvider } from '@openagents/shared'

const BRIEFING_INTERVAL_MS = 60 * 60 * 1000

@Injectable()
export class BriefingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BriefingService.name)
  private timer?: NodeJS.Timeout
  private readonly ranByDay = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly goals: GoalService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runCycle(), BRIEFING_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private get enabled(): boolean {
    const raw = (this.config.get<string>('BRIEFING_ENABLED') ?? 'false').trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(raw)
  }

  private get hourUtc(): number {
    const parsed = Number(this.config.get<string>('BRIEFING_HOUR_UTC') ?? '13')
    return Number.isFinite(parsed) ? Math.max(0, Math.min(23, Math.round(parsed))) : 13
  }

  async runCycle(): Promise<number> {
    if (!this.enabled) return 0
    const now = new Date()
    if (now.getUTCHours() !== this.hourUtc) return 0
    const dayKey = now.toISOString().slice(0, 10)

    const users = await this.prisma.user.findMany({ select: { id: true }, take: 50 })
    let sent = 0
    for (const user of users) {
      const key = `${user.id}:${dayKey}`
      if (this.ranByDay.has(key)) continue
      this.ranByDay.add(key)
      const ok = await this.sendBriefing(user.id).catch((error: any) => {
        this.logger.warn(`Briefing failed for ${user.id}: ${error?.message ?? error}`)
        return false
      })
      if (ok) sent += 1
    }
    return sent
  }

  /** Compose and deliver today's briefing for one user. Returns false when there is nothing to say. */
  async sendBriefing(userId: string, opts?: { force?: boolean }): Promise<boolean> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [goals, loopFacts, approvals, cronRuns, events] = await Promise.all([
      this.goals.listForUser(userId, 'active'),
      this.prisma.memoryFact.findMany({
        where: { userId, entity: 'open_loop' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.approval.count({ where: { userId, status: 'pending' } }),
      this.prisma.cronRun.findMany({
        where: { createdAt: { gte: since }, job: { userId } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { status: true, summary: true, error: true },
      }),
      this.prisma.memoryEvent.findMany({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { summary: true, kind: true },
      }),
    ])

    const hasContent = goals.length > 0 || loopFacts.length > 0 || approvals > 0 || cronRuns.length > 0 || events.length > 0
    if (!hasContent && !opts?.force) return false

    const context = [
      goals.length ? `Active goals:\n${goals.map((g) => `- ${g.title} (${g.progress}%, ${g.priority})`).join('\n')}` : '',
      loopFacts.length ? `Open loops / commitments:\n${loopFacts.map((f) => `- ${this.loopText(f.value)}`).join('\n')}` : '',
      approvals > 0 ? `Pending approvals: ${approvals}` : '',
      cronRuns.length ? `Background jobs (last 24h):\n${cronRuns.map((r) => `- ${r.status}: ${r.summary ?? r.error ?? 'no summary'}`).join('\n')}` : '',
      events.length ? `Recent activity:\n${events.map((e) => `- ${e.summary}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')

    const settings = await this.prisma.userSettings.findUnique({ where: { userId } })
    const provider = (settings?.preferredProvider ?? 'ollama') as LLMProvider

    let text = ''
    try {
      const response = await this.llm.complete(
        [{ role: 'user', content: `Write my morning briefing from the material below. 3-6 short bullets, most urgent first, end with ONE suggested next action. Plain text, no markdown headers.\n\n${context.slice(0, 8000)}` }],
        [],
        'You are a concise chief-of-staff writing a daily briefing for your principal.',
        provider,
        undefined,
        undefined,
        settings?.preferredModel ?? undefined,
      )
      text = (response.content ?? '').trim()
    } catch {
      text = 'Your daily briefing:\n' + context.slice(0, 1500)
    }

    if (!text) return false

    const conversation = await this.prisma.conversation.findFirst({
      where: { userId, title: 'Briefings' },
      orderBy: { createdAt: 'desc' },
    })
    const conversationId = conversation?.id
      ?? (await this.prisma.conversation.create({ data: { userId, title: 'Briefings' }, select: { id: true } })).id

    await this.prisma.message.create({
      data: { conversationId, role: 'agent', content: `☀️ Daily briefing — ${new Date().toDateString()}\n\n${text}`, status: 'done' },
    })
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
    await this.notifications.create(userId, 'Morning briefing', text.slice(0, 300), 'info').catch(() => undefined)
    await this.telegram.deliver(userId, `☀️ ${text.slice(0, 3500)}`).catch(() => false)
    this.logger.log(`Briefing delivered for ${userId}.`)
    return true
  }

  private loopText(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as { text?: string; dueDate?: string }
      const due = parsed.dueDate ? ` (due ${parsed.dueDate.slice(0, 10)})` : ''
      return `${parsed.text ?? raw}${due}`
    } catch {
      return raw
    }
  }
}
