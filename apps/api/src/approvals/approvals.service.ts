import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common'
import Bull, { type Queue } from 'bull'
import {
  APPROVAL_JOB_NAMES,
  QUEUE_NAMES,
  type ApprovalJobData,
  type ApprovalRiskLevel,
} from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { ToolsService } from '../tools/tools.service'
import { NotificationsService } from '../notifications/notifications.service'
import { DataLineageService } from '../lineage/lineage.service'

export interface CreateApprovalDto {
  conversationId: string
  messageId: string
  userId: string
  toolName: string
  toolInput: Record<string, unknown>
}

export interface ApprovalRiskScore {
  level: ApprovalRiskLevel
  score: number
  reason: string
}

export interface ApprovalRiskState extends ApprovalRiskScore {
  autoApproved: boolean
  autonomyWithinWindow: boolean
  toolName: string | null
  updatedAt: string
}

@Injectable()
export class ApprovalsService implements OnModuleDestroy {
  private readonly logger = new Logger(ApprovalsService.name)
  private readonly approvalQueue?: Queue<ApprovalJobData>
  private readonly continuationMode: 'inline' | 'queue'
  private readonly riskStateByUser = new Map<string, ApprovalRiskState>()

  constructor(
    private prisma: PrismaService,
    private tools: ToolsService,
    private notifications: NotificationsService,
    private lineage: DataLineageService,
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

  scoreToolRisk(input: {
    toolName: string
    toolInput: Record<string, unknown>
    requiresApprovalByPolicy: boolean
    outsideAutonomyWindow: boolean
  }): ApprovalRiskScore {
    const { toolName, toolInput, requiresApprovalByPolicy, outsideAutonomyWindow } = input
    const lowerTool = toolName.toLowerCase()
    let score = 5
    const reasons: string[] = []

    if (requiresApprovalByPolicy) {
      score += 60
      reasons.push('Tool policy requires explicit approval.')
    }
    if (outsideAutonomyWindow) {
      score += 20
      reasons.push('Requested outside autonomy window.')
    }
    if (/(gmail|calendar_create_event|cron_remove|cron_add|draft|send|delete|remove|bybit_place_demo_order|order_create|trade)/i.test(lowerTool)) {
      score += 22
      reasons.push('Tool can mutate external state.')
    }
    if (/(web_fetch|web_search|bybit_get_)/i.test(lowerTool)) {
      score += 8
      reasons.push('Tool reads external network sources.')
    }

    const serialized = this.safeSerialize(toolInput).toLowerCase()
    if (/(password|api[_-]?key|token|secret|private[_-]?key|credential)/i.test(serialized)) {
      score += 28
      reasons.push('Input contains credential-like material.')
    }
    if (/(http:\/\/|https:\/\/)/i.test(serialized)) {
      score += 10
      reasons.push('Input includes URL targets.')
    }
    if (serialized.length > 1800) {
      score += 6
      reasons.push('Large input payload increases review complexity.')
    }

    const bounded = Math.max(0, Math.min(100, score))
    const level: ApprovalRiskLevel = bounded >= 70 ? 'high' : bounded >= 35 ? 'medium' : 'low'
    return {
      level,
      score: bounded,
      reason: reasons.length ? reasons.join(' ') : 'Low-impact read-only action.',
    }
  }

  shouldAutoApproveLowRisk(input: {
    riskLevel: ApprovalRiskLevel
    withinAutonomyWindow: boolean
    requiresApprovalByPolicy: boolean
  }) {
    return input.riskLevel === 'low'
      && input.withinAutonomyWindow
      && !input.requiresApprovalByPolicy
  }

  recordRiskState(userId: string, input: {
    toolName: string
    level: ApprovalRiskLevel
    score: number
    reason: string
    autoApproved: boolean
    autonomyWithinWindow: boolean
  }) {
    this.riskStateByUser.set(userId, {
      toolName: input.toolName,
      level: input.level,
      score: input.score,
      reason: input.reason,
      autoApproved: input.autoApproved,
      autonomyWithinWindow: input.autonomyWithinWindow,
      updatedAt: new Date().toISOString(),
    })
  }

  getLatestRiskState(userId: string): ApprovalRiskState {
    return this.riskStateByUser.get(userId) ?? {
      level: 'low',
      score: 0,
      reason: 'No tool calls yet.',
      autoApproved: false,
      autonomyWithinWindow: false,
      toolName: null,
      updatedAt: new Date(0).toISOString(),
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

    const followupMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'agent',
        status: result.success ? 'done' : 'error',
        content: this.buildFollowupMessage(toolName, result),
      },
    })
    await this.lineage.recordMessage({
      userId,
      conversationId,
      messageId: followupMessage.id,
      source: 'approval',
      tools: [{
        toolName,
        status: result.success ? 'executed' : 'failed',
        requiresApproval: true,
        approvalId,
        ...(this.compactRecord(toolInput) ? { input: this.compactRecord(toolInput)! } : {}),
        outputPreview: this.renderToolOutput(result.output),
        error: result.success ? null : (result.error ?? 'Tool failed'),
      }],
      approvals: [approvalId],
      externalSources: [
        ...this.lineage.extractExternalSources(toolInput),
        ...this.lineage.extractExternalSources(result.output),
      ],
      notes: ['approval_continuation'],
    }).catch((error) => {
      this.logger.warn(`Failed to record approval lineage (${approvalId}): ${this.safeError(error)}`)
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

  private compactRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const out: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      if (typeof raw === 'string') out[key.slice(0, 80)] = raw.slice(0, 400)
      else if (typeof raw === 'number' || typeof raw === 'boolean' || raw == null) out[key.slice(0, 80)] = raw
      else {
        try {
          out[key.slice(0, 80)] = JSON.parse(JSON.stringify(raw))
        } catch {
          out[key.slice(0, 80)] = String(raw).slice(0, 400)
        }
      }
    }
    return out
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
  }

  private safeSerialize(value: unknown) {
    try {
      return JSON.stringify(value) ?? ''
    } catch {
      return String(value)
    }
  }
}
