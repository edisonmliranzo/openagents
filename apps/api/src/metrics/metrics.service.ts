import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  MetricsQuery,
  MetricsSummary,
  AgentMetrics,
  ToolMetrics,
  ConversationMetrics,
  DailyMetrics,
  UserMetrics,
  ApprovalMetrics,
} from '@openagents/shared'

@Injectable()
export class MetricsService {
  constructor(private prisma: PrismaService) {}

  async logMetric(data: {
    userId: string
    metricType: string
    action: string
    provider?: string
    model?: string
    durationMs?: number
    tokensUsed?: number
    costUsd?: number
    conversationId?: string
    toolName?: string
    metadata?: Record<string, unknown>
  }) {
    return this.prisma.metricLog.create({
      data: {
        userId: data.userId,
        metricType: data.metricType,
        action: data.action,
        provider: data.provider,
        model: data.model,
        durationMs: data.durationMs,
        tokensUsed: data.tokensUsed,
        costUsd: data.costUsd,
        conversationId: data.conversationId,
        toolName: data.toolName,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    })
  }

  async getMetricsSummary(userId: string, query: MetricsQuery = {}): Promise<MetricsSummary> {
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const endDate = query.endDate ? new Date(query.endDate) : new Date()

    const whereClause: any = {
      userId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    }

    const [agentMetrics, toolMetrics, conversationMetrics, dailyMetrics] = await Promise.all([
      this.getAgentMetrics(userId, startDate, endDate),
      this.getToolMetrics(userId, startDate, endDate),
      this.getConversationMetrics(userId, startDate, endDate),
      this.getDailyMetrics(userId, startDate, endDate, query.groupBy || 'day'),
    ])

    return {
      agent: agentMetrics,
      tools: toolMetrics,
      conversations: conversationMetrics,
      daily: dailyMetrics,
    }
  }

  private async getAgentMetrics(userId: string, startDate: Date, endDate: Date): Promise<AgentMetrics> {
    const logs = await this.prisma.metricLog.findMany({
      where: {
        userId,
        metricType: 'agent_run',
        createdAt: { gte: startDate, lte: endDate },
      },
    })

    const totalRuns = logs.length
    const successfulRuns = logs.filter((l) => l.action === 'completed').length
    const failedRuns = logs.filter((l) => l.action === 'failed').length
    const totalDuration = logs.reduce((sum, l) => sum + (l.durationMs || 0), 0)
    const totalTokens = logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0)
    const totalCost = logs.reduce((sum, l) => sum + (l.costUsd || 0), 0)

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      averageDurationMs: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
      totalTokens,
      totalCost: Math.round(totalCost * 100) / 100,
    }
  }

  private async getToolMetrics(userId: string, startDate: Date, endDate: Date): Promise<ToolMetrics[]> {
    const logs = await this.prisma.metricLog.findMany({
      where: {
        userId,
        metricType: 'tool_call',
        createdAt: { gte: startDate, lte: endDate },
      },
    })

    const toolMap = new Map<string, typeof logs>()
    for (const log of logs) {
      const existing = toolMap.get(log.toolName || 'unknown') || []
      existing.push(log)
      toolMap.set(log.toolName || 'unknown', existing)
    }

    return Array.from(toolMap.entries()).map(([toolName, toolLogs]) => {
      const totalCalls = toolLogs.length
      const successfulCalls = toolLogs.filter((l) => l.action === 'completed').length
      const failedCalls = toolLogs.filter((l) => l.action === 'failed').length
      const totalDuration = toolLogs.reduce((sum, l) => sum + (l.durationMs || 0), 0)
      const totalCost = toolLogs.reduce((sum, l) => sum + (l.costUsd || 0), 0)

      return {
        toolName,
        totalCalls,
        successfulCalls,
        failedCalls,
        averageDurationMs: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
        totalCost: Math.round(totalCost * 100) / 100,
      }
    })
  }

  private async getConversationMetrics(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ConversationMetrics> {
    const [conversations, messageCount] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          userId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.message.count({
        where: {
          conversation: { userId },
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ])

    const totalConversations = conversations.length
    const totalMessages = messageCount
    const avgMessagesPerConv = totalConversations > 0 ? totalMessages / totalConversations : 0

    return {
      totalConversations,
      totalMessages,
      averageMessagesPerConversation: Math.round(avgMessagesPerConv * 10) / 10,
      averageConversationDurationMs: 0,
    }
  }

  private async getDailyMetrics(
    userId: string,
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' | 'month',
  ): Promise<DailyMetrics[]> {
    const logs = await this.prisma.metricLog.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate },
      },
    })

    const dailyMap = new Map<string, DailyMetrics>()

    for (const log of logs) {
      const date = new Date(log.createdAt)
      let key: string

      if (groupBy === 'day') {
        key = date.toISOString().split('T')[0]
      } else if (groupBy === 'week') {
        const week = Math.ceil(date.getDate() / 7)
        key = `${date.getFullYear()}-W${week}`
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      }

      const existing = dailyMap.get(key) || {
        date: key,
        runs: 0,
        tokens: 0,
        cost: 0,
        approvals: 0,
        conversations: 0,
      }

      if (log.metricType === 'agent_run') {
        existing.runs++
        existing.tokens += log.tokensUsed || 0
        existing.cost += log.costUsd || 0
      } else if (log.metricType === 'approval') {
        existing.approvals++
      }

      dailyMap.set(key, existing)
    }

    return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  }

  async getUserMetrics(userId: string, startDate?: string, endDate?: string): Promise<UserMetrics> {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    const whereClause = {
      userId,
      createdAt: { gte: start, lte: end },
    }

    const [runLogs, approvalLogs, tokenUsage] = await Promise.all([
      this.prisma.metricLog.findMany({
        where: { ...whereClause, metricType: 'agent_run' },
      }),
      this.prisma.metricLog.findMany({
        where: { ...whereClause, metricType: 'approval' },
      }),
      this.prisma.metricLog.aggregate({
        where: whereClause,
        _sum: { tokensUsed: true, costUsd: true },
      }),
    ])

    const totalRuns = runLogs.length
    const successfulRuns = runLogs.filter((l) => l.action === 'completed').length
    const failedRuns = runLogs.filter((l) => l.action === 'failed').length

    const totalApprovals = approvalLogs.length
    const approvedApprovals = approvalLogs.filter((l) => l.action === 'approved').length
    const deniedApprovals = approvalLogs.filter((l) => l.action === 'denied').length

    return {
      userId,
      totalTokens: tokenUsage._sum.tokensUsed || 0,
      totalCost: Math.round((tokenUsage._sum.costUsd || 0) * 100) / 100,
      totalRuns,
      successfulRuns,
      failedRuns,
      totalApprovals,
      approvedApprovals,
      deniedApprovals,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    }
  }

  async getApprovalMetrics(userId: string, startDate?: string, endDate?: string): Promise<ApprovalMetrics> {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    const approvals = await this.prisma.approval.findMany({
      where: {
        userId,
        createdAt: { gte: start, lte: end },
      },
    })

    const total = approvals.length
    const pending = approvals.filter((a) => a.status === 'pending').length
    const approved = approvals.filter((a) => a.status === 'approved').length
    const denied = approvals.filter((a) => a.status === 'denied').length

    const resolvedApprovals = approvals.filter((a) => a.resolvedAt)
    const totalResolutionTime = resolvedApprovals.reduce((sum, a) => {
      return sum + (a.resolvedAt!.getTime() - a.createdAt.getTime())
    }, 0)
    const avgResolutionTime = resolvedApprovals.length > 0
      ? Math.round(totalResolutionTime / resolvedApprovals.length)
      : 0

    return {
      total,
      pending,
      approved,
      denied,
      approvalRate: total > 0 ? Math.round((approved / (approved + denied || 1)) * 100) : 0,
      averageResolutionTimeMs: avgResolutionTime,
    }
  }

  async updateBudgetSpend(userId: string, amountUsd: number): Promise<void> {
    const budgets = await this.prisma.budgetLimit.findMany({
      where: { userId, enabled: true },
    })

    const now = new Date()

    for (const budget of budgets) {
      if (now >= budget.periodStart && now <= budget.periodEnd) {
        await this.prisma.budgetLimit.update({
          where: { id: budget.id },
          data: { currentSpentUsd: { increment: amountUsd } },
        })
      }
    }
  }

  async checkBudgetStatus(userId: string): Promise<{ overBudget: boolean; budgets: any[] }> {
    const budgets = await this.prisma.budgetLimit.findMany({
      where: { userId, enabled: true },
    })

    const now = new Date()
    const activeBudgets = budgets.filter((b) => now >= b.periodStart && now <= b.periodEnd)
    const overBudget = activeBudgets.some((b) => b.currentSpentUsd >= b.limitUsd)

    return {
      overBudget,
      budgets: activeBudgets.map((b) => ({
        id: b.id,
        budgetType: b.budgetType,
        limitUsd: b.limitUsd,
        currentSpentUsd: b.currentSpentUsd,
        alertAtUsd: b.alertAtUsd,
        remainingUsd: Math.max(0, b.limitUsd - b.currentSpentUsd),
        percentUsed: Math.round((b.currentSpentUsd / b.limitUsd) * 100),
        isOverBudget: b.currentSpentUsd >= b.limitUsd,
        isNearLimit: b.alertAtUsd ? b.currentSpentUsd >= b.alertAtUsd : false,
      })),
    }
  }

  async setBudgetLimit(
    userId: string,
    budgetType: string,
    limitUsd: number,
    alertAtUsd?: number,
  ): Promise<any> {
    const now = new Date()
    let periodStart: Date
    let periodEnd: Date

    switch (budgetType) {
      case 'daily':
        periodStart = new Date(now.setHours(0, 0, 0, 0))
        periodEnd = new Date(now.setHours(23, 59, 59, 999))
        break
      case 'weekly':
        const dayOfWeek = now.getDay()
        periodStart = new Date(now)
        periodStart.setDate(now.getDate() - dayOfWeek)
        periodStart.setHours(0, 0, 0, 0)
        periodEnd = new Date(periodStart)
        periodEnd.setDate(periodStart.getDate() + 6)
        periodEnd.setHours(23, 59, 59, 999)
        break
      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        break
      default:
        periodStart = new Date(0)
        periodEnd = new Date('2099-12-31')
    }

    return this.prisma.budgetLimit.upsert({
      where: { userId_budgetType: { userId, budgetType } },
      create: {
        userId,
        budgetType,
        limitUsd,
        alertAtUsd,
        currentSpentUsd: 0,
        periodStart,
        periodEnd,
        enabled: true,
      },
      update: {
        limitUsd,
        alertAtUsd,
        periodStart,
        periodEnd,
      },
    })
  }

  async deleteBudgetLimit(userId: string, budgetType: string): Promise<void> {
    await this.prisma.budgetLimit.deleteMany({
      where: { userId, budgetType },
    })
  }

  async getBudgetLimits(userId: string): Promise<any[]> {
    const budgets = await this.prisma.budgetLimit.findMany({
      where: { userId },
    })

    return budgets.map((b) => ({
      id: b.id,
      budgetType: b.budgetType,
      limitUsd: b.limitUsd,
      alertAtUsd: b.alertAtUsd,
      currentSpentUsd: b.currentSpentUsd,
      remainingUsd: Math.max(0, b.limitUsd - b.currentSpentUsd),
      percentUsed: Math.round((b.currentSpentUsd / b.limitUsd) * 100),
      enabled: b.enabled,
      periodStart: b.periodStart.toISOString(),
      periodEnd: b.periodEnd.toISOString(),
    }))
  }
}
