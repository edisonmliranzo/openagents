import { Body, Controller, Get, Headers, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import type { CiIncidentStatus, CreateCiIncidentInput } from '@openagents/shared'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { CiHealerService } from './ci-healer.service'

const INCIDENT_STATUSES: CiIncidentStatus[] = [
  'queued',
  'analyzing',
  'auto_retrying',
  'patch_proposed',
  'resolved',
  'failed',
]

class CreateCiIncidentDto implements CreateCiIncidentInput {
  @IsString()
  userId!: string

  @IsString()
  @MaxLength(80)
  provider!: string

  @IsString()
  @MaxLength(240)
  repo!: string

  @IsOptional()
  @IsString()
  @MaxLength(180)
  branch?: string

  @IsOptional()
  @IsString()
  @MaxLength(180)
  pipelineId?: string

  @IsOptional()
  @IsString()
  @MaxLength(180)
  jobName?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commitSha?: string

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  logExcerpt?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  artifactUrls?: string[]

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}

@ApiTags('ci')
@Controller('ci')
export class CiHealerController {
  constructor(private readonly ciHealer: CiHealerService) {}

  @Post('failure')
  reportFailure(
    @Body() dto: CreateCiIncidentDto,
    @Headers('x-ci-healer-token') token?: string,
  ) {
    this.assertWebhookToken(token)
    return this.ciHealer.createIncident(dto)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('incidents')
  list(
    @Req() req: any,
    @Query('status') status?: CiIncidentStatus,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '30', 10)
    const safe = Number.isFinite(parsed) ? parsed : 30
    const normalizedStatus = status && INCIDENT_STATUSES.includes(status) ? status : undefined
    return this.ciHealer.listIncidents(req.user.id, normalizedStatus, safe)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('incidents/:id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.ciHealer.getIncident(req.user.id, id)
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('incidents/:id/process')
  process(@Req() req: any, @Param('id') id: string) {
    return this.ciHealer.getIncident(req.user.id, id)
      .then(() => this.ciHealer.processIncident(id))
  }

  private assertWebhookToken(token?: string) {
    const expected = (process.env.CI_HEALER_TOKEN ?? '').trim()
    if (!expected) return
    const actual = (token ?? '').trim()
    if (actual !== expected) {
      throw new UnauthorizedException('Invalid CI healer token')
    }
  }
}
