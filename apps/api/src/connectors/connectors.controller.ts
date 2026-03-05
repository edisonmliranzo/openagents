import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ConnectorsService } from './connectors.service'

class ReportConnectorHealthDto {
  @IsString()
  connectorId!: string

  @IsBoolean()
  success!: boolean

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120_000)
  latencyMs?: number

  @IsOptional()
  @IsString()
  error?: string

  @IsOptional()
  @IsString()
  tokenExpiresAt?: string

  @IsOptional()
  @IsBoolean()
  rateLimited?: boolean

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

@ApiTags('connectors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorsService) {}

  @Get('health')
  health(@Req() req: any) {
    return this.connectors.listHealth(req.user.id)
  }

  @Post(':connectorId/reconnect')
  reconnect(@Req() req: any, @Param('connectorId') connectorId: string) {
    return this.connectors.reconnect(req.user.id, connectorId)
  }

  @Post('health/report')
  report(@Req() req: any, @Body() dto: ReportConnectorHealthDto) {
    return this.connectors.report(req.user.id, dto)
  }
}
