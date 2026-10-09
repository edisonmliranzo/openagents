import { Controller, Get, Query } from '@nestjs/common'
import { CostService } from './cost.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('costs')
export class CostController {
  constructor(private costs: CostService) {}

  @Get('summary')
  summary(@CurrentUserId() userId: string, @Query('days') days?: string) {
    return this.costs.getSummary(userId, days ? parseInt(days, 10) : undefined)
  }

  @Get('history')
  history(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    return this.costs.getHistory(userId, limit ? parseInt(limit, 10) : undefined)
  }
}
