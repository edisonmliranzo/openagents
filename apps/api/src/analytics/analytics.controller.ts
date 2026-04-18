import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { AnalyticsService } from './analytics.service'
import { Request } from 'express'
import { User } from '@prisma/client'

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get comprehensive analytics summary' })
  @ApiResponse({ status: 200, description: 'Analytics summary retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAnalyticsSummary(
    @Param('userId') userId: string,
    @Query('timeframe') timeframe: '7d' | '30d' | '90d' = '30d',
  ) {
    return this.analyticsService.getAnalyticsSummary(userId, timeframe)
  }

  @Get('tokens')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get token usage metrics' })
  @ApiResponse({ status: 200, description: 'Token metrics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTokenUsage(
    @Param('userId') userId: string,
    @Query('timeframe') timeframe: '7d' | '30d' | '90d' = '30d',
  ) {
    return this.analyticsService.getTokenUsageMetrics(userId, timeframe)
  }

  @Get('costs')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get cost analysis' })
  @ApiResponse({ status: 200, description: 'Cost analysis retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCostAnalysis(
    @Param('userId') userId: string,
    @Query('timeframe') timeframe: '7d' | '30d' | '90d' = '30d',
  ) {
    return this.analyticsService.getCostAnalysis(userId, timeframe)
  }

  @Get('performance')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Performance metrics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPerformanceMetrics(
    @Param('userId') userId: string,
    @Query('timeframe') timeframe: '7d' | '30d' | '90d' = '30d',
  ) {
    return this.analyticsService.getPerformanceMetrics(userId, timeframe)
  }

  @Get('trends')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get usage trends' })
  @ApiResponse({ status: 200, description: 'Usage trends retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUsageTrends(
    @Param('userId') userId: string,
    @Query('timeframe') timeframe: '7d' | '30d' | '90d' = '30d',
  ) {
    return this.analyticsService.getUsageTrends(userId, timeframe)
  }

  @Get('predictions')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get predictive analytics' })
  @ApiResponse({ status: 200, description: 'Predictive analytics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPredictiveAnalytics(
    @Param('userId') userId: string,
    @Query('timeframe') timeframe: '7d' | '30d' | '90d' = '30d',
  ) {
    return this.analyticsService.getPredictiveAnalytics(userId, timeframe)
  }

  @Get('alerts')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get analytics alerts' })
  @ApiResponse({ status: 200, description: 'Analytics alerts retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAlerts(@Param('userId') userId: string) {
    // Implementation for getting alerts
    return []
  }

  @Post('alerts/acknowledge/:alertId')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @ApiResponse({ status: 200, description: 'Alert acknowledged successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async acknowledgeAlert(
    @Param('alertId') alertId: string,
    @Param('userId') userId: string,
  ) {
    // Implementation for acknowledging alerts
    return { success: true }
  }

  @Get('reports')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get analytics reports' })
  @ApiResponse({ status: 200, description: 'Analytics reports retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReports(@Param('userId') userId: string) {
    // Implementation for getting reports
    return []
  }

  @Post('reports/generate')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Generate a custom report' })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateReport(
    @Param('userId') userId: string,
    @Body() reportConfig: any,
  ) {
    // Implementation for generating reports
    return { reportId: 'report-123', status: 'queued' }
  }

  @Get('dashboards')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get user dashboards' })
  @ApiResponse({ status: 200, description: 'Dashboards retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDashboards(@Param('userId') userId: string) {
    // Implementation for getting dashboards
    return []
  }

  @Post('dashboards/create')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Create a new dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createDashboard(
    @Param('userId') userId: string,
    @Body() dashboardConfig: any,
  ) {
    // Implementation for creating dashboards
    return { dashboardId: 'dashboard-123', success: true }
  }

  @Post('dashboards/:dashboardId/widgets')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Add widget to dashboard' })
  @ApiResponse({ status: 200, description: 'Widget added successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async addWidgetToDashboard(
    @Param('dashboardId') dashboardId: string,
    @Param('userId') userId: string,
    @Body() widgetConfig: any,
  ) {
    // Implementation for adding widgets
    return { widgetId: 'widget-123', success: true }
  }

  @Get('export')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Export analytics data' })
  @ApiResponse({ status: 200, description: 'Data exported successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async exportData(
    @Param('userId') userId: string,
    @Query('format') format: 'csv' | 'json' | 'xlsx' = 'csv',
    @Query('timeframe') timeframe: '7d' | '30d' | '90d' = '30d',
  ) {
    // Implementation for exporting data
    return { downloadUrl: 'https://example.com/export/abc123', format }
  }

  @Get('health')
  @Roles('admin')
  @ApiOperation({ summary: 'Get system health metrics' })
  @ApiResponse({ status: 200, description: 'Health metrics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getSystemHealth() {
    // Implementation for system health (admin only)
    return {
      status: 'healthy',
      services: {
        database: 'healthy',
        cache: 'healthy',
        analytics: 'healthy',
      },
      memoryUsage: '45%',
      cpuUsage: '23%',
    }
  }

  @Get('usage-limits')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get usage limits and quotas' })
  @ApiResponse({ status: 200, description: 'Usage limits retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUsageLimits(@Param('userId') userId: string) {
    // Implementation for usage limits
    return {
      tokenLimit: 1000000,
      currentUsage: 250000,
      percentageUsed: 25,
      resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  @Post('optimize')
  @Roles('member', 'admin')
  @ApiOperation({ summary: 'Get optimization recommendations' })
  @ApiResponse({ status: 200, description: 'Optimization recommendations retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOptimizationRecommendations(
    @Param('userId') userId: string,
    @Body() optimizationRequest: any,
  ) {
    // Implementation for optimization recommendations
    return {
      recommendations: [
        {
          type: 'model_switch',
          description: 'Switch to cheaper model for non-critical tasks',
          potentialSavings: 150.50,
          impact: 'medium',
        },
      ],
      summary: {
        totalPotentialSavings: 150.50,
        estimatedImplementationTime: '1 day',
        riskLevel: 'low',
      },
    }
  }
}