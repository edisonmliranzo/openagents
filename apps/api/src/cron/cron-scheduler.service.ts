import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { createHmac } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AgentService } from '../agent/agent.service'
import { CronService } from './cron.service'
import { NotificationsService } from '../notifications/notifications.service'
import { matchesCron, parseEveryInterval } from './cron-expression'
import { assertPublicHttpUrl } from '../frontier/safe-fetch'
import type { ModelRole } from '@openagents/shared'

// ─── Service ─────────────────────────────────────────────────────────────────

const TICK_INTERVAL_MS = 60_000   // check every minute
const MAX_CONCURRENT_JOBS = 5     // run at most N jobs per tick
const DELIVERY_TIMEOUT_MS = 15_000

@Injectable()
export class CronSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronSchedulerService.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private prisma: PrismaService,
    private cronService: CronService,
    private agent: AgentService,
    private notifications: NotificationsService,
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

  /**
   * Runs a job immediately, regardless of its schedule. Returns once the run
   * has completed (or failed) and the run record has been written.
   */
  async runNow(userId: string, jobId: string): Promise<{ ok: true; jobId: string }> {
    const job = await this.prisma.cronJob.findFirst({
      where: { id: jobId, userId },
      include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    if (!job) {
      throw new NotFoundException('Cron job not found')
    }

    this.logger.log(`CronScheduler: manual run of "${job.name}" (${job.id}) for user ${userId}`)
    await this.executeJob(job, new Date())

    return { ok: true, jobId }
  }

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

      // Scheduled work can use a heavier model than the live conversation.
      const scheduledModel = await this.modelForRole(userId, 'scheduled')

      // No-op emit for background runs — messages are saved to DB by agent.run()
      const emitted: Array<[string, unknown]> = []
      const emit = (event: string, data: unknown) => { emitted.push([event, data]) }

      await this.agent.run({
        conversationId,
        userId,
        userMessage: job.payloadText,
        emit,
        ...(scheduledModel ? { modelOverride: scheduledModel } : {}),
        systemPromptAppendix: `[Background cron task: "${job.name}". Run at ${now.toISOString()}. Complete the task silently and save any relevant findings to memory.]`,
      })

      const reply = this.extractAgentReply(emitted)

      const durationMs = Date.now() - startedAt
      await this.cronService.runJob(userId, job.id, {
        source: 'manual',
        status: 'ok',
        durationMs,
        summaryPrefix: `Completed "${job.name}" in ${durationMs}ms`,
      })

      await this.deliver(job, reply, durationMs)

      this.logger.log(`CronScheduler: job "${job.name}" done in ${durationMs}ms`)
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      this.logger.error(`CronScheduler: job "${job.name}" failed: ${msg}`)
      await this.cronService.runJob(userId, job.id, {
        source: 'manual',
        status: 'error',
        error: msg,
        durationMs: Date.now() - startedAt,
        summaryPrefix: `Error in "${job.name}": ${msg.slice(0, 120)}`,
      }).catch(() => {})
    }
  }

  /** The model the user pinned for this kind of work, if any. */
  private async modelForRole(userId: string, role: ModelRole): Promise<string | undefined> {
    try {
      const settings = await this.prisma.userSettings.findUnique({ where: { userId } })
      const roles = (settings as any)?.modelRoles as Partial<Record<ModelRole, string>> | undefined
      const model = roles?.[role]?.trim()
      return model || undefined
    } catch {
      return undefined
    }
  }

  /** Pulls the agent's final reply out of the emitted events. */
  private extractAgentReply(emitted: Array<[string, unknown]>): string {
    for (let i = emitted.length - 1; i >= 0; i -= 1) {
      const [event, data] = emitted[i]
      if (event !== 'message') continue
      const payload = data as { role?: string; content?: string } | null
      if (payload?.role === 'agent' && typeof payload.content === 'string' && payload.content.trim()) {
        return payload.content
      }
    }
    return ''
  }

  // ── Delivery ──────────────────────────────────────────────────────────────

  /**
   * Delivers the run result according to the job's `deliveryMode`:
   *  - `none`     → nothing is sent
   *  - `announce` → an in-app notification for the user
   *  - `webhook`  → a signed POST to `deliveryTarget`
   */
  private async deliver(job: any, reply: string, durationMs: number) {
    const mode = String(job.deliveryMode ?? 'none')
    if (mode === 'none') return

    const body = reply?.trim()
      ? reply.trim()
      : `Job "${job.name}" finished in ${durationMs}ms without producing a reply.`

    if (mode === 'announce') {
      await this.notifications
        .create(job.userId, `Scheduled: ${job.name}`, body, 'info')
        .catch((err: any) => this.logger.warn(`Cron announce failed: ${err?.message ?? err}`))
      return
    }

    if (mode === 'webhook') {
      await this.deliverWebhook(job, body, durationMs)
    }
  }

  private async deliverWebhook(job: any, body: string, durationMs: number) {
    const target = String(job.deliveryTarget ?? '').trim()
    if (!target) {
      this.logger.warn(`Cron job "${job.name}" has deliveryMode=webhook but no deliveryTarget`)
      return
    }

    let url: URL
    try {
      url = await assertPublicHttpUrl(target)
    } catch (error: any) {
      this.logger.warn(`Cron job "${job.name}" webhook target rejected: ${error?.message ?? error}`)
      return
    }

    const payload = {
      event: 'cron.job.completed',
      jobId: job.id,
      name: job.name,
      userId: job.userId,
      durationMs,
      output: body,
      finishedAt: new Date().toISOString(),
    }
    const serialized = JSON.stringify(payload)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-OpenAgents-Event': 'cron.job.completed',
      'X-OpenAgents-Job-Id': job.id,
    }

    const secret = process.env.CRON_WEBHOOK_SECRET?.trim()
    if (secret) {
      headers['X-OpenAgents-Signature'] = createHmac('sha256', secret).update(serialized).digest('hex')
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: serialized,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      })
      if (!response.ok) {
        this.logger.warn(`Cron job "${job.name}" webhook returned ${response.status}`)
      }
    } catch (error: any) {
      this.logger.warn(`Cron job "${job.name}" webhook failed: ${error?.message ?? error}`)
    }
  }

  // ── Conversation resolution ───────────────────────────────────────────────

  private async resolveConversationId(userId: string, job: any): Promise<string | null> {
    // "isolated" jobs get their own conversation, so their output never mixes
    // with the user's live chat.
    if (job.sessionTarget === 'isolated') {
      const title = `Cron: ${job.name}`
      const existing = await this.prisma.conversation.findFirst({
        where: { userId, title },
        orderBy: { createdAt: 'desc' },
      })
      if (existing) return existing.id

      const created = await this.prisma.conversation.create({
        data: { userId, title },
      })
      return created.id
    }

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
