import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { describeSchedule, isValidCron, nextRunAt, parseEveryInterval } from './cron-expression'
import type {
  CreateCronJobInput,
  CronHealthSummary,
  CronJobHealth,
  CronRunStatus,
  CronScheduleKind,
  CronSelfHealInput,
  CronSelfHealReport,
  UpdateCronJobInput,
} from '@openagents/shared'

@Injectable()
export class CronService {
  constructor(private prisma: PrismaService) {}

  async listJobs(userId: string) {
    const jobs = await this.prisma.cronJob.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    return jobs.map((job) => this.decorateJob(job))
  }

  /** Adds the derived fields the UI needs (next run, human-readable schedule). */
  private decorateJob<
    T extends {
      id: string
      name: string
      enabled: boolean
      scheduleKind: string
      scheduleValue: string
      createdAt: Date
      runs?: Array<{ status: string; createdAt: Date }>
    },
  >(job: T) {
    const kind = (job.scheduleKind === 'at' || job.scheduleKind === 'cron'
      ? job.scheduleKind
      : 'every') as CronScheduleKind

    const next = job.enabled ? nextRunAt(kind, job.scheduleValue, new Date()) : null

    return {
      ...job,
      nextRunAt: next ? next.toISOString() : null,
      scheduleLabel: describeSchedule(kind, job.scheduleValue),
      lastRunAt: job.runs?.[0]?.createdAt ? job.runs[0].createdAt.toISOString() : null,
      lastRunStatus: job.runs?.[0]?.status ?? null,
    }
  }

  async createJob(userId: string, input: CreateCronJobInput) {
    this.assertValidSchedule(input.scheduleKind, input.scheduleValue)

    const job = await this.prisma.cronJob.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
        scheduleKind: input.scheduleKind,
        scheduleValue: input.scheduleValue,
        sessionTarget: input.sessionTarget ?? 'main',
        payloadKind: input.payloadKind ?? 'systemEvent',
        payloadText: input.payloadText,
        deliveryMode: input.deliveryMode ?? 'none',
        deliveryTarget: input.deliveryTarget ?? null,
      },
    })

    return this.decorateJob(job)
  }

  async getJob(userId: string, id: string) {
    await this.assertOwnership(id, userId)
    const job = await this.prisma.cronJob.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!job) throw new NotFoundException('Cron job not found')
    return this.decorateJob(job)
  }

  async updateJob(userId: string, id: string, input: UpdateCronJobInput) {
    await this.assertOwnership(id, userId)

    if (input.scheduleKind !== undefined && input.scheduleValue !== undefined) {
      this.assertValidSchedule(input.scheduleKind, input.scheduleValue)
    }

    const job = await this.prisma.cronJob.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.scheduleKind !== undefined ? { scheduleKind: input.scheduleKind } : {}),
        ...(input.scheduleValue !== undefined ? { scheduleValue: input.scheduleValue } : {}),
        ...(input.sessionTarget !== undefined ? { sessionTarget: input.sessionTarget } : {}),
        ...(input.payloadKind !== undefined ? { payloadKind: input.payloadKind } : {}),
        ...(input.payloadText !== undefined ? { payloadText: input.payloadText } : {}),
        ...(input.deliveryMode !== undefined ? { deliveryMode: input.deliveryMode } : {}),
        ...(input.deliveryTarget !== undefined ? { deliveryTarget: input.deliveryTarget } : {}),
      },
    })

    return this.decorateJob(job)
  }

  /** Rejects schedules the engine could never act on. */
  private assertValidSchedule(kind: string, value: string) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) {
      throw new BadRequestException('scheduleValue is required.')
    }

    if (kind === 'cron' && !isValidCron(trimmed)) {
      throw new BadRequestException(
        `"${trimmed}" is not a valid cron expression. Use 5 fields: minute hour day-of-month month day-of-week.`,
      )
    }
    if (kind === 'every' && !parseEveryInterval(trimmed)) {
      throw new BadRequestException(
        `"${trimmed}" is not a valid interval. Use 30s, 5m, 2h or 1d.`,
      )
    }
    if (kind === 'at' && Number.isNaN(new Date(trimmed).getTime())) {
      throw new BadRequestException(`"${trimmed}" is not a valid date.`)
    }
  }

  async deleteJob(userId: string, id: string) {
    await this.assertOwnership(id, userId)
    await this.prisma.cronJob.delete({ where: { id } })
    return { ok: true }
  }

  async runJob(
    userId: string,
    id: string,
    options?: {
      source?: 'manual' | 'self-heal'
      summaryPrefix?: string
      status?: 'ok' | 'error' | 'skipped'
      error?: string | null
      durationMs?: number
    },
  ) {
    const job = await this.assertOwnership(id, userId)
    const startedAt = Date.now()
    const source = options?.source ?? 'manual'
    const status = options?.status ?? 'ok'
    const summaryPrefix = options?.summaryPrefix ?? (source === 'self-heal'
      ? `Self-heal run accepted for "${job.name}"`
      : `Manual run accepted for "${job.name}"`)

    const run = await this.prisma.cronRun.create({
      data: {
        cronJobId: job.id,
        status,
        summary: summaryPrefix,
        error: options?.error ?? null,
        durationMs: Math.max(1, options?.durationMs ?? Date.now() - startedAt),
      },
    })

    await this.prisma.cronJob.update({
      where: { id: job.id },
      data: { updatedAt: new Date() },
    })

    return run
  }

  async listRuns(userId: string, jobId: string, limit = 25) {
    await this.assertOwnership(jobId, userId)
    return this.prisma.cronRun.findMany({
      where: { cronJobId: jobId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
    })
  }

  async health(userId: string, staleAfterMinutes = 24 * 60): Promise<CronHealthSummary> {
    const staleAfterMs = Math.max(5, Math.min(staleAfterMinutes, 7 * 24 * 60)) * 60 * 1000
    const jobs = await this.prisma.cronJob.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })

    const entries = jobs.map((job) => this.buildHealthEntry(job, staleAfterMs))
    return {
      generatedAt: new Date().toISOString(),
      totals: {
        jobs: jobs.length,
        enabledJobs: jobs.filter((job) => job.enabled).length,
        staleJobs: entries.filter((entry) => entry.stale).length,
        failingJobs: entries.filter((entry) => entry.lastStatus === 'error').length,
      },
      staleJobs: entries.filter((entry) => entry.stale),
      failingJobs: entries.filter((entry) => entry.lastStatus === 'error'),
    }
  }

  async selfHeal(userId: string, input: CronSelfHealInput = {}): Promise<CronSelfHealReport> {
    const now = Date.now()
    const maxRetries = Math.max(1, Math.min(input.maxRetries ?? 3, 8))
    const staleAfterMs = Math.max(5, Math.min(input.staleAfterMinutes ?? 24 * 60, 7 * 24 * 60)) * 60 * 1000

    const jobs = await this.prisma.cronJob.findMany({
      where: { userId, enabled: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })

    const actions: CronSelfHealReport['actions'] = []
    for (const job of jobs) {
      const entry = this.buildHealthEntry(job, staleAfterMs)

      if (entry.lastStatus === 'error') {
        if (entry.consecutiveFailures > maxRetries) {
          actions.push({
            jobId: job.id,
            name: job.name,
            action: 'skipped',
            reason: `Retry cap reached (${entry.consecutiveFailures}/${maxRetries}).`,
          })
          continue
        }

        const retryDueTs = entry.retryDueAt ? new Date(entry.retryDueAt).getTime() : 0
        if (retryDueTs > now) {
          actions.push({
            jobId: job.id,
            name: job.name,
            action: 'skipped',
            reason: 'Backoff window active.',
            backoffMs: Math.max(0, retryDueTs - now),
          })
          continue
        }

        const retryOrdinal = entry.consecutiveFailures + 1
        const run = await this.runJob(userId, job.id, {
          source: 'self-heal',
          summaryPrefix: `Self-heal retry #${retryOrdinal} for "${job.name}"`,
        })
        actions.push({
          jobId: job.id,
          name: job.name,
          action: 'retry-run',
          reason: `Recovered failed job after ${entry.consecutiveFailures} consecutive failure(s).`,
          runId: run.id,
        })
        continue
      }

      if (entry.stale) {
        const run = await this.runJob(userId, job.id, {
          source: 'self-heal',
          summaryPrefix: `Self-heal stale recovery for "${job.name}"`,
        })
        actions.push({
          jobId: job.id,
          name: job.name,
          action: 'stale-run',
          reason: 'Job was stale and was executed to recover schedule cadence.',
          runId: run.id,
        })
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      healedCount: actions.filter((action) => action.action !== 'skipped').length,
      skippedCount: actions.filter((action) => action.action === 'skipped').length,
      actions,
    }
  }

  private async assertOwnership(jobId: string, userId: string) {
    const job = await this.prisma.cronJob.findUnique({
      where: { id: jobId },
    })

    if (!job) throw new NotFoundException('Cron job not found')
    if (job.userId !== userId) throw new ForbiddenException()
    return job
  }

  private buildHealthEntry(
    job: {
      id: string
      name: string
      enabled: boolean
      updatedAt: Date
      runs: Array<{ status: string; createdAt: Date }>
    },
    staleAfterMs: number,
  ): CronJobHealth {
    const now = Date.now()
    const latestRun = job.runs[0]
    const lastRunAt = latestRun?.createdAt ?? null
    const lastStatus = this.normalizeRunStatus(latestRun?.status)

    let consecutiveFailures = 0
    for (const run of job.runs) {
      if (this.normalizeRunStatus(run.status) !== 'error') break
      consecutiveFailures += 1
    }

    const staleReferenceTs = lastRunAt?.getTime() ?? job.updatedAt.getTime()
    const stale = job.enabled && now - staleReferenceTs > staleAfterMs

    let retryDueAt: string | null = null
    if (lastRunAt && consecutiveFailures > 0) {
      const backoffMs = Math.min(
        60 * 60 * 1000,
        Math.pow(2, Math.max(0, consecutiveFailures - 1)) * 5 * 60 * 1000,
      )
      retryDueAt = new Date(lastRunAt.getTime() + backoffMs).toISOString()
    }

    return {
      jobId: job.id,
      name: job.name,
      enabled: job.enabled,
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      lastStatus,
      consecutiveFailures,
      stale,
      retryDueAt,
    }
  }

  private normalizeRunStatus(status: string | null | undefined): CronRunStatus | null {
    if (status === 'ok' || status === 'error' || status === 'skipped') return status
    return null
  }
}
