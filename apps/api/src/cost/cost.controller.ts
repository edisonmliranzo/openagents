import { Controller, Get, Query } from '@nestjs/common'
import { CostService } from './cost.service'

@Controller('api/v1/costs')
export class CostController {
  constructor(private costs: CostService) {}

  @Get('summary')
  summary(@Query('userId') userId: string, @Query('days') days?: string) {
    return this.costs.getSummary(userId, days ? parseInt(days, 10) : undefined)
  }

  @Get('history')
  history(@Query('userId') userId: string, @Query('limit') limit?: string) {
    return this.costs.getHistory(userId, limit ? parseInt(limit, 10) : undefined)
  }
}
