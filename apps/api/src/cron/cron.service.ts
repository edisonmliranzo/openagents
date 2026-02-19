import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateCronJobInput, UpdateCronJobInput } from '@openagents/shared'

@Injectable()
export class CronService {
  constructor(private prisma: PrismaService) {}

  async listJobs(userId: string) {
    return this.prisma.cronJob.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
  }

  async createJob(userId: string, input: CreateCronJobInput) {
    return this.prisma.cronJob.create({
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
  }

  async updateJob(userId: string, id: string, input: UpdateCronJobInput) {
    await this.assertOwnership(id, userId)
    return this.prisma.cronJob.update({
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
  }

  async deleteJob(userId: string, id: string) {
    await this.assertOwnership(id, userId)
    await this.prisma.cronJob.delete({ where: { id } })
    return { ok: true }
  }

  async runJob(userId: string, id: string) {
    const job = await this.assertOwnership(id, userId)
    const startedAt = Date.now()
    const run = await this.prisma.cronRun.create({
      data: {
        cronJobId: job.id,
        status: 'ok',
        summary: `Manual run accepted for "${job.name}"`,
        durationMs: Math.max(1, Date.now() - startedAt),
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

  private async assertOwnership(jobId: string, userId: string) {
    const job = await this.prisma.cronJob.findUnique({
      where: { id: jobId },
    })

    if (!job) throw new NotFoundException('Cron job not found')
    if (job.userId !== userId) throw new ForbiddenException()
    return job
  }
}
