import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common'
import Bull, { type Queue } from 'bull'
import {
  APPROVAL_JOB_NAMES,
  QUEUE_NAMES,
  type Approval,
  type ApprovalJobData,
  type ApprovalRiskLevel,
} from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { ToolsService } from '../tools/tools.service'
import { NotificationsService } from '../notifications/notifications.service'
import { DataLineageService } from '../lineage/lineage.service'
import { MissionControlService } from '../mission-control/mission-control.service'

export interface CreateApprovalDto {
  conversationId: string
  messageId: string
  userId: string
  toolName: string
  toolInput: Record<string, unknown>
  risk?: ApprovalRiskScore
  requiresApprovalByPolicy?: boolean
  autonomyWithinWindow?: boolean
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

export interface ApprovalContinuationResult {
  status: 'completed' | 'already_completed' | 'ignored'
  toolName: string
  detail: string
  success?: boolean
}

@Injectable()
export class ApprovalsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApprovalsService.name)
  private readonly approvalQueue?: Queue<ApprovalJobData>
  private readonly continuationMode: 'inline' | 'queue'
  private readonly riskStateByUser = new Map<string, ApprovalRiskState>()

  constructor(
    private prisma: PrismaService,
    private tools: ToolsService,
    private notifications: NotificationsService,
    private lineage: DataLineageService,
    private mission: MissionControlService,
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

  onModuleInit() {
    if (this.continuationMode !== 'inline') return
    void this.resumeApprovedContinuations()
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
    if (/(gmail|calendar_create_event|calendar_update_event|calendar_cancel_event|cron_remove|cron_add|draft|send|delete|remove|update|cancel|bybit_place_demo_order|order_create|trade)/i.test(lowerTool)) {
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
    const created = await this.prisma.approval.create({
      data: { ...dto, toolInput: JSON.stringify(dto.toolInput) },
    })
    const approval = this.toApprovalView(created, dto)
    await this.mission.publish({
      userId: dto.userId,
      type: 'approval',
      status: 'pending',
      source: 'agent.approval',
      conversationId: dto.conversationId,
      approvalId: created.id,
      payload: {
        toolName: dto.toolName,
        risk: approval.risk ?? null,
        inputKeys: approval.inputKeys ?? [],
      },
    })
    return approval
  }

  /**
   * Approval replay: given a lineage message, re-approve any linked pending approvals.
   * Useful for replaying tool calls that were interrupted or denied from the lineage view.
   */
  async replayFromLineage(
    userId: string,
    messageId: string,
  ): Promise<{ replayed: string[]; skipped: string[]; detail: string }> {
    const record = await this.lineage.getByMessage(userId, messageId)
    if (!record) {
      return { replayed: [], skipped: [], detail: 'No lineage record found for this message.' }
    }

    const approvalIds = record.approvals
    if (approvalIds.length === 0) {
      return { replayed: [], skipped: [], detail: 'No approvals linked to this message.' }
    }

    const replayed: string[] = []
    const skipped: string[] = []

    const rows = await this.prisma.approval.findMany({
      where: { id: { in: approvalIds }, userId },
      select: { id: true, status: true },
    })
    const rowMap = new Map(rows.map((row) => [row.id, row]))

    for (const approvalId of approvalIds) {
      const approval = rowMap.get(approvalId)
      if (!approval) { skipped.push(approvalId); continue }
      if (approval.status === 'approved') { skipped.push(approvalId); continue }

      if (approval.status !== 'pending') {
        // denied or other — reset to pending before resolving
        await this.prisma.approval.update({
          where: { id: approvalId },
          data: { status: 'pending', resolvedAt: null },
        })
      }

      try {
        await this.resolve(approvalId, userId, true)
        replayed.push(approvalId)
      } catch {
        skipped.push(approvalId)
      }
    }

    return {
      replayed,
      skipped,
      detail: `Replayed ${replayed.length} approval(s), skipped ${skipped.length}.`,
    }
  }

  async list(userId: string, status?: 'pending' | 'approved' | 'denied') {
    const approvals = await this.prisma.approval.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        message: {
          select: { metadata: true },
        },
      },
    })
    return approvals.map((approval) => this.toApprovalView(approval))
  }

  async resolve(id: string, userId: string, approved: boolean) {
    const approval = await this.prisma.approval.findUnique({
      where: { id },
      include: {
        message: {
          select: { metadata: true },
        },
      },
    })
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
        await this.continueApprovedResolutionById(updated.id, 'inline')
      }
    } else {
      await this.prisma.message.update({
        where: { id: approval.messageId },
        data: { status: 'error' },
      })

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

    await this.mission.publish({
      userId: approval.userId,
      type: 'approval',
      status: approved ? 'approved' : 'denied',
      source: 'approval.resolve',
      conversationId: approval.conversationId,
      approvalId: approval.id,
      payload: {
        toolName: approval.toolName,
        risk: this.toApprovalView(approval).risk ?? null,
      },
    })

    return this.toApprovalView({
      ...updated,
      message: approval.message,
    })
  }

  async continueApprovedResolutionById(
    approvalId: string,
    source: 'inline' | 'queue' = 'queue',
  ): Promise<ApprovalContinuationResult> {
    const approval = await this.prisma.approval.findUnique({
      where: { id: approvalId },
      select: {
        id: true,
        conversationId: true,
        messageId: true,
        userId: true,
        toolName: true,
        toolInput: true,
        status: true,
      },
    })

    if (!approval) throw new NotFoundException(`Approval not found: ${approvalId}`)
    if (approval.status !== 'approved') {
      return {
        status: 'ignored',
        toolName: approval.toolName,
        detail: `Approval status is ${approval.status}.`,
      }
    }

    const message = await this.prisma.message.findUnique({
      where: { id: approval.messageId },
      select: { id: true, toolResultJson: true },
    })
    if (!message) throw new NotFoundException(`Approval message not found: ${approval.messageId}`)

    if (message.toolResultJson) {
      return {
        status: 'already_completed',
        toolName: approval.toolName,
        detail: `Approval ${approvalId} already has toolResultJson.`,
      }
    }

    const toolInput = this.parseToolInput(approval.toolInput, approval.id)
    return this.continueApprovedResolution({
      approvalId: approval.id,
      conversationId: approval.conversationId,
      messageId: approval.messageId,
      userId: approval.userId,
      toolName: approval.toolName,
      toolInput,
      source,
    })
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
      jobId: `approval:${data.approvalId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false,
    })
  }

  private async continueApprovedResolution(input: {
    approvalId: string
    conversationId: string
    messageId: string
    userId: string
    toolName: string
    toolInput: Record<string, unknown>
    source: 'inline' | 'queue'
  }): Promise<ApprovalContinuationResult> {
    const { approvalId, conversationId, messageId, userId, toolName, toolInput, source } = input
    await this.mission.publish({
      userId,
      type: 'tool_call',
      status: 'started',
      source: `approval.${source}`,
      conversationId,
      approvalId,
      payload: {
        toolName,
      },
    })

    await this.prisma.message.update({
      where: { id: messageId },
      data: { status: 'streaming' },
    })

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

    await this.mission.publish({
      userId,
      type: result.success ? 'tool_call' : 'failure',
      status: result.success ? 'success' : 'failed',
      source: `approval.${source}`,
      conversationId,
      approvalId,
      payload: {
        toolName,
        error: result.success ? null : (result.error ?? 'Tool failed'),
      },
    })

    this.logger.log(
      `Approval ${approvalId} continued via ${source}. Tool ${toolName} ${result.success ? 'succeeded' : 'failed'}.`,
    )

    return {
      status: 'completed',
      toolName,
      detail: `Tool ${toolName} ${result.success ? 'succeeded' : 'failed'}.`,
      success: result.success,
    }
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

  private async resumeApprovedContinuations() {
    const candidates = await this.prisma.approval.findMany({
      where: { status: 'approved' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        toolName: true,
        message: {
          select: {
            toolResultJson: true,
          },
        },
      },
    })

    for (const candidate of candidates) {
      if (candidate.message?.toolResultJson) continue
      try {
        await this.continueApprovedResolutionById(candidate.id, 'inline')
      } catch (error) {
        this.logger.warn(
          `Failed to resume approved action ${candidate.id} (${candidate.toolName}): ${this.safeError(error)}`,
        )
      }
    }
  }

  private toApprovalView(
    approval: {
      id: string
      conversationId: string
      messageId: string
      userId: string
      toolName: string
      toolInput: string
      status: string
      resolvedAt: Date | null
      createdAt: Date
      message?: { metadata: string | null } | null
    },
    overrides?: {
      risk?: ApprovalRiskScore
      requiresApprovalByPolicy?: boolean
      autonomyWithinWindow?: boolean
    },
  ): Approval {
    const toolInput = this.parseToolInput(approval.toolInput, approval.id)
    const metadata = this.parseApprovalMetadata(approval.message?.metadata)
    const preview = this.renderToolOutput(toolInput)
    const risk: Approval['risk'] =
      overrides?.risk
      ?? (metadata.riskLevel && Number.isFinite(metadata.riskScore)
        ? {
            level: metadata.riskLevel as 'low' | 'medium' | 'high',
            score: Number(metadata.riskScore),
            reason: metadata.riskReason || 'Approval review required.',
          }
        : null)

    return {
      id: approval.id,
      conversationId: approval.conversationId,
      messageId: approval.messageId,
      userId: approval.userId,
      toolName: approval.toolName,
      toolInput,
      ...(preview ? { toolInputPreview: preview.slice(0, 220) } : {}),
      inputKeys: Object.keys(toolInput).slice(0, 8),
      risk,
      requiresApprovalByPolicy:
        overrides?.requiresApprovalByPolicy ?? metadata.requiresApprovalByPolicy ?? false,
      autonomyWithinWindow:
        overrides?.autonomyWithinWindow ?? metadata.autonomyWithinWindow ?? false,
      status: approval.status as Approval['status'],
      resolvedAt: approval.resolvedAt ? approval.resolvedAt.toISOString() : null,
      createdAt: approval.createdAt.toISOString(),
    }
  }

  private parseApprovalMetadata(raw: string | null | undefined) {
    if (!raw) {
      return {
        riskLevel: null as ApprovalRiskLevel | null,
        riskScore: null as number | null,
        riskReason: '',
        autonomyWithinWindow: null as boolean | null,
        requiresApprovalByPolicy: null as boolean | null,
      }
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const riskLevel =
        parsed.riskLevel === 'low' || parsed.riskLevel === 'medium' || parsed.riskLevel === 'high'
          ? parsed.riskLevel
          : null
      const parsedRiskScore =
        typeof parsed.riskScore === 'number'
          ? parsed.riskScore
          : Number.parseFloat(String(parsed.riskScore ?? ''))
      const riskScore = Number.isFinite(parsedRiskScore) ? parsedRiskScore : null
      return {
        riskLevel,
        riskScore,
        riskReason: typeof parsed.riskReason === 'string' ? parsed.riskReason : '',
        autonomyWithinWindow:
          typeof parsed.autonomyWithinWindow === 'boolean' ? parsed.autonomyWithinWindow : null,
        requiresApprovalByPolicy:
          typeof parsed.requiresApprovalByPolicy === 'boolean'
            ? parsed.requiresApprovalByPolicy
            : null,
      }
    } catch {
      return {
        riskLevel: null as ApprovalRiskLevel | null,
        riskScore: null as number | null,
        riskReason: '',
        autonomyWithinWindow: null as boolean | null,
        requiresApprovalByPolicy: null as boolean | null,
      }
    }
  }
}
