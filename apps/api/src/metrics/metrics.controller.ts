import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { MetricsService } from './metrics.service'
import { PrismaService } from '../prisma/prisma.service'

@Controller('api/v1/metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('live')
  async getLive(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalSessions,
      sessions24h,
      totalMessages,
      messages24h,
      totalMemory,
      recentSessions,
    ] = await Promise.all([
      this.prisma.conversation.count({ where: { userId } }).catch(() => 0),
      this.prisma.conversation.count({ where: { userId, createdAt: { gte: since24h } } }).catch(() => 0),
      this.prisma.message.count({ where: { conversation: { userId } } }).catch(() => 0),
      this.prisma.message.count({ where: { conversation: { userId }, createdAt: { gte: since24h } } }).catch(() => 0),
      this.prisma.memory.count({ where: { userId } }).catch(() => 0),
      this.prisma.conversation.findMany({
        where: { userId, createdAt: { gte: since7d } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, createdAt: true },
      }).catch(() => []),
    ])

    // Build daily activity for last 7 days
    const dailyActivity: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      dailyActivity[key] = 0
    }
    for (const s of recentSessions as any[]) {
      const key = (s.createdAt as Date).toISOString().slice(0, 10)
      if (key in dailyActivity) dailyActivity[key]++
    }

    return {
      totalSessions,
      sessions24h,
      totalMessages,
      messages24h,
      totalMemory,
      dailyActivity,
      generatedAt: now.toISOString(),
    }
  }

  @Get('summary')
  async getSummary(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month',
  ) {
    return this.metricsService.getMetricsSummary(req.user.id, { startDate, endDate, groupBy })
  }

  @Get('logs')
  async getMetricLogs(
    @Request() req: any,
    @Query('take') take?: string,
    @Query('metricType') metricType?: string,
    @Query('action') action?: string,
  ) {
    return this.metricsService.listMetricLogs(req.user.id, {
      take: take ? parseInt(take, 10) : undefined,
      metricType,
      action,
    })
  }

  @Get('user')
  async getUserMetrics(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.metricsService.getUserMetrics(req.user.id, startDate, endDate)
  }

  @Get('approvals')
  async getApprovalMetrics(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.metricsService.getApprovalMetrics(req.user.id, startDate, endDate)
  }

  @Get('budget')
  async getBudgetLimits(@Request() req: any) {
    return this.metricsService.getBudgetLimits(req.user.id)
  }

  @Get('budget/status')
  async getBudgetStatus(@Request() req: any) {
    return this.metricsService.checkBudgetStatus(req.user.id)
  }

  @Post('budget')
  async setBudgetLimit(
    @Request() req: any,
    @Body() body: { budgetType: string; limitUsd: number; alertAtUsd?: number },
  ) {
    return this.metricsService.setBudgetLimit(
      req.user.id,
      body.budgetType,
      body.limitUsd,
      body.alertAtUsd,
    )
  }

  @Delete('budget/:budgetType')
  async deleteBudgetLimit(@Request() req: any, @Param('budgetType') budgetType: string) {
    await this.metricsService.deleteBudgetLimit(req.user.id, budgetType)
    return { deleted: true }
  }

  @Post('log')
  async logMetric(
    @Request() req: any,
    @Body()
    body: {
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
    },
  ) {
    return this.metricsService.logMetric({
      userId: req.user.id,
      ...body,
    })
  }
}
