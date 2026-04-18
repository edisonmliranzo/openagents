import { AuditSeverity, AuditCategory } from '@openagents/shared'
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { ConversationRepairIssue, ConversationRepairReport } from '@openagents/shared'
import { ApprovalsService } from '../approvals/approvals.service'
import { RuntimeEventsService } from '../events/runtime-events.service'

const STUCK_MESSAGE_WINDOW_MS = 5 * 60 * 1000

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private approvals: ApprovalsService,
    private runtimeEvents: RuntimeEventsService,
  ) {}

  async list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
    })
  }

  async get(id: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id } })
    if (!conv) throw new NotFoundException()
    if (conv.userId !== userId) throw new ForbiddenException()
    return conv
  }

  async create(userId: string, title?: string) {
    const conversation = await this.prisma.conversation.create({
      data: { userId, title: title ?? null },
    })
    void this.runtimeEvents.publish({
      name: 'conversation.started',
      userId,
      conversationId: conversation.id,
      actor: { type: 'user', id: userId },
      resource: { type: 'conversation', id: conversation.id },
      payload: {
        title: conversation.title,
      },
    })
    return conversation
  }

  async messages(conversationId: string, userId: string) {
    await this.get(conversationId, userId)
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async delete(id: string, userId: string) {
    await this.get(id, userId)
    await this.prisma.$transaction([
      this.prisma.userSettings.updateMany({
        where: { userId, lastActiveConversationId: id },
        data: { lastActiveConversationId: null },
      }),
      this.prisma.conversation.delete({ where: { id } }),
    ])
  }

  async touchLastMessage(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    })
  }

  async inspectRepair(conversationId: string, userId: string): Promise<ConversationRepairReport> {
    await this.get(conversationId, userId)
    return this.buildRepairReport(conversationId, userId, false, [])
  }

  async repairState(conversationId: string, userId: string): Promise<ConversationRepairReport> {
    await this.get(conversationId, userId)
    const actions: string[] = []
    const now = Date.now()

    const [messages, approvals, agentRuns] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.approval.findMany({
        where: { conversationId, userId },
        include: {
          message: {
            select: {
              toolResultJson: true,
            },
          },
        },
      }),
      this.prisma.agentRun.findMany({
        where: { conversationId },
      }),
    ])

    const unresolvedApproved = approvals.filter(
      (approval) => approval.status === 'approved' && !approval.message?.toolResultJson,
    )
    for (const approval of unresolvedApproved) {
      await this.approvals.continueApprovedResolutionById(approval.id, 'inline')
      actions.push(`continued approval ${approval.id}`)
    }

    const staleMessages = messages.filter((message) => {
      if (message.status !== 'pending' && message.status !== 'streaming') return false
      return now - message.createdAt.getTime() >= STUCK_MESSAGE_WINDOW_MS
    })
    if (staleMessages.length > 0) {
      await this.prisma.message.updateMany({
        where: {
          id: {
            in: staleMessages.map((message) => message.id),
          },
          status: {
            in: ['pending', 'streaming'],
          },
        },
        data: {
          status: 'error',
        },
      })
      actions.push(`marked ${staleMessages.length} stale messages as error`)
    }

    const pendingApprovals = approvals.filter((approval) => approval.status === 'pending')
    const unresolvedAfterContinuation = approvals.filter(
      (approval) => approval.status === 'approved' && !approval.message?.toolResultJson,
    )
    if (pendingApprovals.length === 0 && unresolvedAfterContinuation.length === 0) {
      const waitingRuns = agentRuns.filter((run) => run.status === 'waiting_approval')
      if (waitingRuns.length > 0) {
        await this.prisma.agentRun.updateMany({
          where: {
            id: {
              in: waitingRuns.map((run) => run.id),
            },
          },
          data: {
            status: 'error',
            finishedAt: new Date(),
            error: 'Conversation repair closed orphaned waiting approval state.',
          },
        })
        actions.push(`closed ${waitingRuns.length} orphaned waiting runs`)
      }
    }

    const latestMessage = messages[messages.length - 1]
    if (latestMessage) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: latestMessage.createdAt },
      })
      actions.push('refreshed conversation lastMessageAt')
    }

    return this.buildRepairReport(conversationId, userId, true, actions)
  }

  private async buildRepairReport(
    conversationId: string,
    userId: string,
    repaired: boolean,
    actions: string[],
  ): Promise<ConversationRepairReport> {
    const [conversation, messages, approvals, agentRuns] = await Promise.all([
      this.prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      }),
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.approval.findMany({
        where: { conversationId, userId },
        include: {
          message: {
            select: {
              toolResultJson: true,
            },
          },
        },
      }),
      this.prisma.agentRun.findMany({
        where: { conversationId },
      }),
    ])

    const issues: ConversationRepairIssue[] = []
    const now = Date.now()
    const pendingApprovals = approvals.filter((approval) => approval.status === 'pending')
    const unresolvedApprovedApprovals = approvals.filter(
      (approval) => approval.status === 'approved' && !approval.message?.toolResultJson,
    )
    const waitingRuns = agentRuns.filter((run) => run.status === 'waiting_approval')
    const stuckMessages = messages.filter((message) => {
      if (message.status !== 'pending' && message.status !== 'streaming') return false
      return now - message.createdAt.getTime() >= STUCK_MESSAGE_WINDOW_MS
    })
    const latestMessage = messages[messages.length - 1] ?? null

    if (pendingApprovals.length > 0) {
      issues.push({
        code: 'pending_approvals',
        severity: AuditSeverity.INFO,
        message: `${pendingApprovals.length} approval(s) still waiting on user action.`,
        relatedIds: pendingApprovals.map((approval) => approval.id),
      })
    }
    if (unresolvedApprovedApprovals.length > 0) {
      issues.push({
        code: 'approved_actions_not_continued',
        severity: AuditSeverity.CRITICAL,
        message: `${unresolvedApprovedApprovals.length} approved action(s) have not completed.`,
        relatedIds: unresolvedApprovedApprovals.map((approval) => approval.id),
      })
    }
    if (waitingRuns.length > 0 && pendingApprovals.length === 0 && unresolvedApprovedApprovals.length === 0) {
      issues.push({
        code: 'orphaned_waiting_runs',
        severity: AuditSeverity.WARNING,
        message: `${waitingRuns.length} run(s) are still waiting for approval, but no matching approvals remain.`,
        relatedIds: waitingRuns.map((run) => run.id),
      })
    }
    if (stuckMessages.length > 0) {
      issues.push({
        code: 'stale_streaming_messages',
        severity: AuditSeverity.WARNING,
        message: `${stuckMessages.length} message(s) have been stuck in pending/streaming state.`,
        relatedIds: stuckMessages.map((message) => message.id),
      })
    }
    if (latestMessage && (!conversation.lastMessageAt || conversation.lastMessageAt.getTime() !== latestMessage.createdAt.getTime())) {
      issues.push({
        code: 'last_message_at_drift',
        severity: AuditSeverity.INFO,
        message: 'Conversation lastMessageAt does not match the latest message timestamp.',
        relatedIds: [latestMessage.id],
      })
    }

    return {
      conversationId,
      repaired,
      issues,
      actions,
      pendingApprovals: pendingApprovals.length,
      unresolvedApprovedApprovals: unresolvedApprovedApprovals.length,
      waitingRuns: waitingRuns.length,
      stuckMessages: stuckMessages.length,
      inspectedAt: new Date().toISOString(),
    }
  }
}
