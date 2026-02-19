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
import { ToolsService } from '../tools/tools.service'
import { NotificationsService } from '../notifications/notifications.service'

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
  private readonly continuationMode: 'inline' | 'queue'

  constructor(
    private prisma: PrismaService,
    private tools: ToolsService,
    private notifications: NotificationsService,
  ) {
    const configuredMode = (process.env.APPROVAL_CONTINUATION_MODE ?? 'inline').toLowerCase()
    this.continuationMode = configuredMode === 'queue' ? 'queue' : 'inline'

    const redisUrl = process.env.REDIS_URL
    if (this.continuationMode === 'queue' && !redisUrl) {
      this.logger.warn('APPROVAL_CONTINUATION_MODE=queue but REDIS_URL is missing. Falling back to inline continuation.')
      return
    }

    if (this.continuationMode === 'queue' && redisUrl) {
      this.approvalQueue = new Bull<ApprovalJobData>(QUEUE_NAMES.approvals, redisUrl)
      this.approvalQueue.on('error', (error) => {
        this.logger.error('Approval queue error', error?.stack ?? String(error))
      })
    }
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
      const toolInput = this.parseToolInput(approval.toolInput, approval.id)
      if (this.approvalQueue) {
        await this.enqueueApprovalResolution({
          approvalId: updated.id,
          approved: true,
          conversationId: approval.conversationId,
          userId: approval.userId,
          toolName: approval.toolName,
          toolInput,
        })
      } else {
        await this.continueApprovedResolution({
          approvalId: updated.id,
          conversationId: approval.conversationId,
          messageId: approval.messageId,
          userId: approval.userId,
          toolName: approval.toolName,
          toolInput,
        })
      }
    } else {
      await this.prisma.agentRun.updateMany({
        where: { conversationId: approval.conversationId, status: 'waiting_approval' },
        data: {
          status: 'error',
          finishedAt: new Date(),
          error: `Approval denied for tool: ${approval.toolName}`,
        },
      })

      await this.notifications
        .create(
          approval.userId,
          'Action denied',
          `Denied tool action: ${approval.toolName}`,
          'warning',
        )
        .catch((error) => this.logger.error('Failed to create deny notification', error?.stack ?? String(error)))
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

  private async continueApprovedResolution(input: {
    approvalId: string
    conversationId: string
    messageId: string
    userId: string
    toolName: string
    toolInput: Record<string, unknown>
  }) {
    const { approvalId, conversationId, messageId, userId, toolName, toolInput } = input
    const result = await this.tools.execute(toolName, toolInput, userId)

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: result.success
          ? this.renderToolOutput(result.output)
          : (result.error ?? 'Tool execution failed'),
        status: result.success ? 'done' : 'error',
        toolResultJson: JSON.stringify(result),
      },
    })

    await this.prisma.message.create({
      data: {
        conversationId,
        role: 'agent',
        status: result.success ? 'done' : 'error',
        content: this.buildFollowupMessage(toolName, result),
      },
    })

    await this.prisma.agentRun.updateMany({
      where: { conversationId, status: 'waiting_approval' },
      data: {
        status: result.success ? 'done' : 'error',
        finishedAt: new Date(),
        ...(result.success ? { error: null } : { error: result.error ?? `Tool failed: ${toolName}` }),
      },
    })

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    })

    await this.notifications
      .create(
        userId,
        result.success ? 'Action completed' : 'Action failed',
        result.success
          ? `${toolName} completed successfully.`
          : `${toolName} failed: ${result.error ?? 'unknown error'}`,
        result.success ? 'success' : 'error',
      )
      .catch((error) => this.logger.error('Failed to create continuation notification', error?.stack ?? String(error)))

    this.logger.log(
      `Approval ${approvalId} continued inline. Tool ${toolName} ${result.success ? 'succeeded' : 'failed'}.`,
    )
  }

  private buildFollowupMessage(
    toolName: string,
    result: { success: boolean; output: unknown; error?: string | null },
  ) {
    if (!result.success) {
      return `I ran \`${toolName}\`, but it failed: ${result.error ?? 'unknown error'}.`
    }
    const rendered = this.renderToolOutput(result.output)
    if (!rendered) {
      return `I ran \`${toolName}\` successfully.`
    }
    return `I ran \`${toolName}\` successfully.\n\nResult:\n${rendered}`
  }

  private renderToolOutput(output: unknown) {
    if (output == null) return ''
    if (typeof output === 'string') return output.slice(0, 4000)
    try {
      const json = JSON.stringify(output, null, 2)
      if (!json) return ''
      return json.length > 4000 ? `${json.slice(0, 4000)}...` : json
    } catch {
      return String(output).slice(0, 4000)
    }
  }
}
