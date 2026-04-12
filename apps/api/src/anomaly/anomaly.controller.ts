import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { AnomalyService } from './anomaly.service'
import { AnomalyDetection, AnomalyConfig, AnomalyType } from '@openagents/shared'

@Controller('anomaly')
export class AnomalyController {
  constructor(private readonly anomalyService: AnomalyService) {}

  @Post('detect')
  async detect(
    @Body() body: { userId: string; type: AnomalyType; value: number },
  ) {
    return this.anomalyService.detect(body.userId, body.type, body.value)
  }

  @Get(':userId')
  async getAnomalies(
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ): Promise<AnomalyDetection[]> {
    return this.anomalyService.getAnomalies(userId, limit)
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: AnomalyDetection['status'] },
  ): Promise<AnomalyDetection> {
    return this.anomalyService.updateStatus(id, body.status)
  }

  @Get(':userId/config')
  async getConfig(@Param('userId') userId: string): Promise<AnomalyConfig> {
    return this.anomalyService.getConfig(userId)
  }

  @Patch(':userId/config')
  async updateConfig(
    @Param('userId') userId: string,
    @Body() config: Partial<AnomalyConfig>,
  ): Promise<AnomalyConfig> {
    return this.anomalyService.updateConfig(userId, config)
  }
}