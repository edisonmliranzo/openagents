import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common'
import { CostService, RouterSettings } from './cost.service'
import { ModelRouterService } from './model-router.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('costs')
export class CostController {
  constructor(private costs: CostService, private router: ModelRouterService) {}

  @Get('summary')
  summary(@CurrentUserId() userId: string, @Query('days') days?: string) {
    return this.costs.getSummary(userId, days ? parseInt(days, 10) : undefined)
  }

  @Get('history')
  history(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    return this.costs.getHistory(userId, limit ? parseInt(limit, 10) : undefined)
  }

  @Get('router')
  getRouter(@CurrentUserId() userId: string) {
    return this.costs.getRouterSettings(userId)
  }

  @Put('router')
  updateRouter(@CurrentUserId() userId: string, @Body() body: Partial<RouterSettings>) {
    return this.costs.updateRouterSettings(userId, body ?? {})
  }

  /** Dry-run the router for a prompt (used by the dashboard "test" box). */
  @Post('router/preview')
  preview(@CurrentUserId() userId: string, @Body() body: { prompt?: string; toolCount?: number }) {
    return this.router.route({ userId, prompt: String(body?.prompt ?? ''), toolCount: body?.toolCount })
  }
}
