import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AgentService } from '../agent/agent.service'
import { CronService } from './cron.service'

// ─── Schedule helpers ─────────────────────────────────────────────────────────

/** Parse "10m", "2h", "30s", "1d" → milliseconds */
function parseEveryInterval(value: string): number | null {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day)s?$/i)
  if (!m) return null
  const n = parseFloat(m[1])
  switch (m[2].toLowerCase()) {
    case 's': case 'sec': return n * 1_000
    case 'm': case 'min': return n * 60_000
    case 'h': case 'hr':  return n * 3_600_000
    case 'd': case 'day': return n * 86_400_000
    default: return null
  }
}

/** Evaluate a 5-field cron expression against a given Date. */
function matchesCron(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return false
  const [minE, hourE, domE, monE, dowE] = parts

  const check = (field: string, value: number, min: number, max: number): boolean => {
    if (field === '*') return true
    if (field.includes('/')) {
      const [range, step] = field.split('/')
      const stepN = parseInt(step, 10)
      const start = range === '*' ? min : parseInt(range, 10)
      return value >= start && (value - start) % stepN === 0
    }
    if (field.includes(',')) return field.split(',').some((f) => check(f.trim(), value, min, max))
    if (field.includes('-')) {
      const [lo, hi] = field.split('-').map(Number)
      return value >= lo && value <= hi
    }
    return parseInt(field, 10) === value
  }

  return (
    check(minE,  date.getUTCMinutes(),  0, 59) &&
    check(hourE, date.getUTCHours(),    0, 23) &&
    check(domE,  date.getUTCDate(),     1, 31) &&
    check(monE,  date.getUTCMonth() + 1, 1, 12) &&
    check(dowE,  date.getUTCDay(),      0,  6)
  )
}

// ─── Service ─────────────────────────────────────────────────────────────────

const TICK_INTERVAL_MS = 60_000   // check every minute
const MAX_CONCURRENT_JOBS = 5     // run at most N jobs per tick

@Injectable()
export class CronSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronSchedulerService.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private prisma: PrismaService,
    private cronService: CronService,
    private agent: AgentService,
  ) {}

  onModuleInit() {
    // Offset the first tick by 5 seconds so the app finishes starting up
    setTimeout(() => {
      void this.tick()
      this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS)
    }, 5_000)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  async tick() {
    if (this.running) return
    this.running = true
    const now = new Date()

    try {
      const jobs = await this.prisma.cronJob.findMany({
        where: { enabled: true, payloadKind: 'agentTurn' },
        include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
      })

      const due = jobs.filter((job) => this.isDue(job, now))
      const batch = due.slice(0, MAX_CONCURRENT_JOBS)

      if (batch.length) {
        this.logger.log(`Scheduler tick: ${batch.length} job(s) due`)
      }

      await Promise.allSettled(batch.map((job) => this.executeJob(job, now)))
    } catch (err: any) {
      this.logger.error(`Scheduler tick error: ${err?.message ?? err}`)
    } finally {
      this.running = false
    }
  }

  // ── Due check ─────────────────────────────────────────────────────────────

  private isDue(job: any, now: Date): boolean {
    const lastRun: Date | null = job.runs[0]?.createdAt ?? null
    const kind: string = job.scheduleKind
    const value: string = job.scheduleValue

    if (kind === 'at') {
      // One-shot: run if we've reached the scheduled time and never ran
      if (lastRun) return false
      const target = new Date(value)
      return !isNaN(target.getTime()) && now >= target
    }

    if (kind === 'every') {
      const intervalMs = parseEveryInterval(value)
      if (!intervalMs) return false
      if (!lastRun) return true
      return now.getTime() - lastRun.getTime() >= intervalMs
    }

    if (kind === 'cron') {
      // Only trigger once per minute — skip if already ran this minute
      if (lastRun) {
        const sinceLastRun = now.getTime() - lastRun.getTime()
        if (sinceLastRun < 55_000) return false   // ran within the last 55 s
      }
      return matchesCron(value, now)
    }

    return false
  }

  // ── Execute ───────────────────────────────────────────────────────────────

  private async executeJob(job: any, now: Date) {
    const userId: string = job.userId
    const startedAt = Date.now()

    try {
      const conversationId = await this.resolveConversationId(userId, job)
      if (!conversationId) {
        this.logger.warn(`CronScheduler: no conversation for user ${userId}, job ${job.id}`)
        await this.cronService.runJob(userId, job.id, {
          source: 'manual',
          status: 'error',
          error: 'No active conversation found for user.',
          summaryPrefix: `Skipped "${job.name}": no conversation`,
        })
        return
      }

      this.logger.log(`CronScheduler: running job "${job.name}" (${job.id}) for user ${userId}`)

      // No-op emit for background runs — messages are saved to DB by agent.run()
      const emitted: Array<[string, unknown]> = []
      const emit = (event: string, data: unknown) => { emitted.push([event, data]) }

      await this.agent.run({
        conversationId,
        userId,
        userMessage: job.payloadText,
        emit,
        systemPromptAppendix: `[Background cron task: "${job.name}". Run at ${now.toISOString()}. Complete the task silently and save any relevant findings to memory.]`,
      })

      const durationMs = Date.now() - startedAt
      await this.cronService.runJob(userId, job.id, {
        source: 'manual',
        status: 'ok',
        summaryPrefix: `Completed "${job.name}" in ${durationMs}ms`,
      })

      this.logger.log(`CronScheduler: job "${job.name}" done in ${durationMs}ms`)
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      this.logger.error(`CronScheduler: job "${job.name}" failed: ${msg}`)
      await this.cronService.runJob(userId, job.id, {
        source: 'manual',
        status: 'error',
        error: msg,
        summaryPrefix: `Error in "${job.name}": ${msg.slice(0, 120)}`,
      }).catch(() => {})
    }
  }

  // ── Conversation resolution ───────────────────────────────────────────────

  private async resolveConversationId(userId: string, job: any): Promise<string | null> {
    // Use last active conversation from user settings
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } })
    if (settings?.lastActiveConversationId) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: settings.lastActiveConversationId },
      })
      if (conv && conv.userId === userId) return conv.id
    }

    // Fall back to most recent conversation
    const latest = await this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
    })
    if (latest) return latest.id

    // Create a new conversation for this user
    const created = await this.prisma.conversation.create({
      data: { userId, title: 'Background Tasks' },
    })
    return created.id
  }
}
