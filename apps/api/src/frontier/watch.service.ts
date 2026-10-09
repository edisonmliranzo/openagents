import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { NotificationsService } from '../notifications/notifications.service'
import { flag, clamp } from './frontier.util'
import { assertPublicHttpUrl, safeFetchText } from './safe-fetch'

const POLL_MS = 60 * 1000

@Injectable()
export class WatchService {
  private readonly logger = new Logger(WatchService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly notifications: NotificationsService,
  ) {}

  get enabled(): boolean {
    return flag(this.config, 'WATCH_TASKS')
  }

  onModuleInit() {
    if (!this.enabled) return
    this.timer = setInterval(() => void this.tick().catch((err) => this.logger.warn(`Watch tick failed: ${err?.message ?? err}`)), POLL_MS)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async create(userId: string, input: { name: string; kind?: string; target: string; condition: string; intervalMin?: number }) {
    const kind = input.kind === 'time' ? 'time' : 'url'
    if (kind === 'url') {
      try {
        await assertPublicHttpUrl(input.target.trim())
      } catch (err: any) {
        throw new BadRequestException(err?.message ?? 'Invalid watch URL')
      }
    }
    return this.prisma.watchTask.create({
      data: {
        userId,
        name: clamp(input.name, 120),
        kind,
        target: input.target.trim(),
        condition: input.condition.trim(),
        intervalMin: Math.max(5, Math.min(1440, Number(input.intervalMin) || 60)),
      },
    })
  }

  list(userId: string) {
    return this.prisma.watchTask.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 })
  }

  async setEnabled(userId: string, id: string, enabled: boolean) {
    return this.prisma.watchTask.updateMany({ where: { id, userId }, data: { enabled } })
  }

  async remove(userId: string, id: string) {
    return this.prisma.watchTask.deleteMany({ where: { id, userId } })
  }

  async runNow(userId: string, id: string) {
    const task = await this.prisma.watchTask.findFirst({ where: { id, userId } })
    if (!task) return null
    return this.evaluate(task)
  }

  private async tick() {
    const now = Date.now()
    const due = await this.prisma.watchTask.findMany({ where: { enabled: true } })
    for (const task of due) {
      const interval = task.intervalMin * 60 * 1000
      if (task.lastCheckAt && now - task.lastCheckAt.getTime() < interval) continue
      await this.evaluate(task)
    }
  }

  private async evaluate(task: any) {
    try {
      if (task.kind === 'time') {
        const when = new Date(task.target)
        const reached = !Number.isNaN(when.getTime()) && Date.now() >= when.getTime()
        const alreadyFired = task.lastFiredAt && new Date(task.lastFiredAt).toDateString() === new Date().toDateString()
        await this.prisma.watchTask.update({
          where: { id: task.id },
          data: { lastCheckAt: new Date(), lastStatus: reached && !alreadyFired ? 'fired' : 'ok', lastDetail: `target ${task.target}` },
        })
        if (reached && !alreadyFired) {
          await this.notifications.create(task.userId, `Watch: ${task.name}`, task.condition, 'info' as any)
          await this.prisma.watchTask.update({ where: { id: task.id }, data: { lastFiredAt: new Date() } })
          return { fired: true }
        }
        return { fired: false }
      }

      const html = await safeFetchText(task.target)
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const judge = await this.llm.complete(
        [{ role: 'user', content: `Condition: ${task.condition}\n\nPage content (truncated):\n${clamp(text, 3800)}\n\nReply JSON only: {"met": true|false, "detail": "<=140 chars evidence"}` }],
        [],
        'You decide whether a stated condition is satisfied by page content. Be strict: only true with concrete evidence.',
        'ollama',
      )
      let met = false
      let detail = ''
      try {
        const parsed = JSON.parse(judge.content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
        met = parsed.met === true
        detail = String(parsed.detail ?? '').slice(0, 200)
      } catch {
        detail = judge.content.slice(0, 200)
      }
      const alreadyFiredToday = task.lastFiredAt && new Date(task.lastFiredAt).toDateString() === new Date().toDateString()
      await this.prisma.watchTask.update({
        where: { id: task.id },
        data: { lastCheckAt: new Date(), lastStatus: met ? 'fired' : 'ok', lastDetail: detail },
      })
      if (met && !alreadyFiredToday) {
        await this.notifications.create(task.userId, `Watch fired: ${task.name}`, detail || task.condition, 'info' as any)
        await this.prisma.watchTask.update({ where: { id: task.id }, data: { lastFiredAt: new Date() } })
      }
      return { fired: met && !alreadyFiredToday, detail }
    } catch (err: any) {
      await this.prisma.watchTask
        .update({ where: { id: task.id }, data: { lastCheckAt: new Date(), lastStatus: 'error', lastDetail: clamp(String(err?.message ?? err), 200) } })
        .catch(() => undefined)
      return { fired: false, error: String(err?.message ?? err) }
    }
  }
}
