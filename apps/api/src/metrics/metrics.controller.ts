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

@Controller('api/v1/metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('summary')
  async getSummary(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month',
  ) {
    return this.metricsService.getMetricsSummary(req.user.id, { startDate, endDate, groupBy })
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
