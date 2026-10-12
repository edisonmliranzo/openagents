import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TasksService } from '../tasks/tasks.service'
import { NotificationsService } from '../notifications/notifications.service'
import { findRecurringPrompts, tokenize, type PromptOccurrence } from './life-logic'

@Injectable()
export class AnticipationService {
  private readonly logger = new Logger(AnticipationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
  ) {}

  list(userId: string) {
    return this.prisma.anticipation.findMany({ where: { userId, status: { not: 'done' } }, orderBy: { nextDueAt: 'asc' } })
  }

  async update(userId: string, id: string, patch: { status?: string; cadenceDays?: number }) {
    const row = await this.prisma.anticipation.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('Anticipation not found')
    const data: Record<string, unknown> = {}
    if (['active', 'paused', 'done'].includes(String(patch.status))) {
      data.status = patch.status
      if (patch.status === 'active') data.nextDueAt = new Date(Date.now() + (row.cadenceDays * 86400_000) / 2)
    }
    if (patch.cadenceDays) {
      data.cadenceDays = Math.max(3, Math.min(Number(patch.cadenceDays), 60))
      data.nextDueAt = new Date(Date.now() + Math.max(3, Math.min(Number(patch.cadenceDays), 60)) * 86400_000)
    }
    return this.prisma.anticipation.update({ where: { id }, data: data as any })
  }

  /** Learn recurring patterns from the last 60 days of user prompts. */
  async learn(userId: string): Promise<{ created: number; updated: number }> {
    const since = new Date(Date.now() - 60 * 86400_000)
    const messages = await this.prisma.message.findMany({
      where: { conversation: { userId }, role: 'user', createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      take: 800,
      select: { content: true, createdAt: true },
    })
    const occurrences: PromptOccurrence[] = messages
      .map((m) => ({ text: String(m.content).trim(), at: m.createdAt }))
      .filter((o) => o.text.length >= 12 && o.text.length <= 400)

    const candidates = findRecurringPrompts(occurrences)
    const existing = await this.prisma.anticipation.findMany({ where: { userId } })
    const existingByToken = new Map<string, string>()
    for (const row of existing) existingByToken.set(this.fingerprint(row.patternText), row.id)

    let created = 0
    let updated = 0
    for (const c of candidates) {
      const fp = this.fingerprint(c.patternText)
      const matchId = existingByToken.get(fp)
      if (matchId) {
        await this.prisma.anticipation.update({
          where: { id: matchId },
          data: { exampleCount: c.exampleCount, lastSeenAt: c.lastSeenAt, cadenceDays: c.cadenceDays },
        })
        updated += 1
        continue
      }
      await this.prisma.anticipation.create({
        data: {
          userId,
          patternText: c.patternText,
          exampleCount: c.exampleCount,
          cadenceDays: c.cadenceDays,
          lastSeenAt: c.lastSeenAt,
          nextDueAt: new Date(c.lastSeenAt.getTime() + c.cadenceDays * 86400_000),
        },
      })
      created += 1
    }
    this.logger.log(`Anticipation learn: ${created} new, ${updated} updated for ${userId}`)
    return { created, updated }
  }

  /** Pre-run due patterns; results park as notifications, never auto-sent. */
  async tick() {
    const due = await this.prisma.anticipation.findMany({
      where: { status: 'active', nextDueAt: { lte: new Date() } },
      take: 5,
    })
    for (const row of due) {
      try {
        const task = await this.tasks.create(row.userId, {
          goal: `${row.patternText} (pre-run automatically — you usually ask around now; treat this as a draft answer)`,
          maxSteps: 8,
        })
        await this.prisma.anticipation.update({
          where: { id: row.id },
          data: { lastTaskId: task.id, nextDueAt: new Date(Date.now() + row.cadenceDays * 86400_000) },
        })
        await this.notifications
          .create(row.userId, 'Ran ahead of you', `"${row.patternText.slice(0, 80)}" is being prepared — find it in Tasks.`, 'info')
          .catch(() => undefined)
      } catch (err: any) {
        this.logger.warn(`Anticipation run failed: ${err?.message ?? err}`)
      }
    }
    return due.length
  }

  /** Boot hook: learn nightly, tick every 30 min. */
  onModuleInit() {
    setTimeout(() => void this.tick().catch(() => undefined), 20_000)
    setInterval(() => void this.tick().catch(() => undefined), 30 * 60_000).unref?.()
    setInterval(() => {
      void this.prisma.user.findMany({ select: { id: true } }).then((users) => {
        for (const u of users) void this.learn(u.id).catch(() => undefined)
      }).catch(() => undefined)
    }, 24 * 3600_000).unref?.()
  }

  private fingerprint(text: string): string {
    return [...tokenize(text)].sort().slice(0, 12).join('|')
  }
}
