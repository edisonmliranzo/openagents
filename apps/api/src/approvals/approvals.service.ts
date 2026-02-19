import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common'
import Bull, { type Queue } from 'bull'
import { APPROVAL_JOB_NAMES, QUEUE_NAMES, type ApprovalJobData } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateApprovalDto {
  conversationId: string
  messageId: string
  userId: string
  toolName: string
  toolInput: Record<string, unknown>
}

@Injectable()
export class ApprovalsService implements OnModuleDestroy {
  private readonly logger = new Logger(ApprovalsService.name)
  private readonly approvalQueue?: Queue<ApprovalJobData>

  constructor(private prisma: PrismaService) {
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
      this.logger.warn('REDIS_URL is missing, approval continuation queue is disabled.')
      return
    }

    this.approvalQueue = new Bull<ApprovalJobData>(QUEUE_NAMES.approvals, redisUrl)
    this.approvalQueue.on('error', (error) => {
      this.logger.error('Approval queue error', error?.stack ?? String(error))
    })
  }

  async onModuleDestroy() {
    if (this.approvalQueue) {
      await this.approvalQueue.close()
    }
  }

  async create(dto: CreateApprovalDto) {
    return this.prisma.approval.create({
      data: { ...dto, toolInput: JSON.stringify(dto.toolInput) },
    })
  }

  async list(userId: string, status?: 'pending' | 'approved' | 'denied') {
    return this.prisma.approval.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    })
  }

  async resolve(id: string, userId: string, approved: boolean) {
    const approval = await this.prisma.approval.findUnique({ where: { id } })
    if (!approval) throw new NotFoundException()
    if (approval.userId !== userId) throw new ForbiddenException()
    if (approval.status !== 'pending') throw new BadRequestException('Approval already resolved')

    const updated = await this.prisma.approval.update({
      where: { id },
      data: {
        status: approved ? 'approved' : 'denied',
        resolvedAt: new Date(),
      },
    })

    // Update linked message status
    await this.prisma.message.update({
      where: { id: approval.messageId },
      data: { status: approved ? 'done' : 'error' },
    })

    if (approved) {
      await this.enqueueApprovalResolution({
        approvalId: updated.id,
        approved: true,
        conversationId: approval.conversationId,
        userId: approval.userId,
        toolName: approval.toolName,
        toolInput: this.parseToolInput(approval.toolInput, approval.id),
      })
    }

    return updated
  }

  private parseToolInput(raw: string, approvalId: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.logger.warn(`Approval ${approvalId} has non-object toolInput. Defaulting to empty object.`)
        return {}
      }
      return parsed as Record<string, unknown>
    } catch {
      this.logger.warn(`Approval ${approvalId} has invalid JSON toolInput. Defaulting to empty object.`)
      return {}
    }
  }

  private async enqueueApprovalResolution(data: ApprovalJobData) {
    if (!this.approvalQueue) {
      this.logger.warn(
        `Approval ${data.approvalId} resolved, but queue is unavailable. Worker continuation was skipped.`,
      )
      return
    }

    await this.approvalQueue.add(APPROVAL_JOB_NAMES.resolved, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 100,
    })
  }
}
