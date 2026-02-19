import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { CronService } from './cron.service'
import type {
  CreateCronJobInput,
  CronDeliveryMode,
  CronPayloadKind,
  CronScheduleKind,
  CronSessionTarget,
  UpdateCronJobInput,
} from '@openagents/shared'

const SCHEDULE_KINDS: CronScheduleKind[] = ['every', 'at', 'cron']
const SESSION_TARGETS: CronSessionTarget[] = ['main', 'isolated']
const PAYLOAD_KINDS: CronPayloadKind[] = ['systemEvent', 'agentTurn']
const DELIVERY_MODES: CronDeliveryMode[] = ['none', 'announce', 'webhook']

class CreateCronJobDto implements CreateCronJobInput {
  @IsString()
  @MaxLength(120)
  name!: string

  @IsString()
  @IsOptional()
  description?: string | null

  @IsBoolean()
  @IsOptional()
  enabled?: boolean

  @IsIn(SCHEDULE_KINDS)
  scheduleKind!: CronScheduleKind

  @IsString()
  scheduleValue!: string

  @IsIn(SESSION_TARGETS)
  @IsOptional()
  sessionTarget?: CronSessionTarget

  @IsIn(PAYLOAD_KINDS)
  @IsOptional()
  payloadKind?: CronPayloadKind

  @IsString()
  payloadText!: string

  @IsIn(DELIVERY_MODES)
  @IsOptional()
  deliveryMode?: CronDeliveryMode

  @IsString()
  @IsOptional()
  deliveryTarget?: string | null
}

class UpdateCronJobDto implements UpdateCronJobInput {
  @IsString()
  @MaxLength(120)
  @IsOptional()
  name?: string

  @IsString()
  @IsOptional()
  description?: string | null

  @IsBoolean()
  @IsOptional()
  enabled?: boolean

  @IsIn(SCHEDULE_KINDS)
  @IsOptional()
  scheduleKind?: CronScheduleKind

  @IsString()
  @IsOptional()
  scheduleValue?: string

  @IsIn(SESSION_TARGETS)
  @IsOptional()
  sessionTarget?: CronSessionTarget

  @IsIn(PAYLOAD_KINDS)
  @IsOptional()
  payloadKind?: CronPayloadKind

  @IsString()
  @IsOptional()
  payloadText?: string

  @IsIn(DELIVERY_MODES)
  @IsOptional()
  deliveryMode?: CronDeliveryMode

  @IsString()
  @IsOptional()
  deliveryTarget?: string | null
}

@ApiTags('cron')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cron/jobs')
export class CronController {
  constructor(private cron: CronService) {}

  @Get()
  list(@Req() req: any) {
    return this.cron.listJobs(req.user.id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateCronJobDto) {
    return this.cron.createJob(req.user.id, dto)
  }

  @Patch(':id')
  patch(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCronJobDto) {
    return this.cron.updateJob(req.user.id, id, dto)
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.cron.deleteJob(req.user.id, id)
  }

  @Post(':id/run')
  run(@Req() req: any, @Param('id') id: string) {
    return this.cron.runJob(req.user.id, id)
  }

  @Get(':id/runs')
  runs(@Req() req: any, @Param('id') id: string, @Query('limit') limit?: string) {
    const parsedLimit = Number.parseInt(limit ?? '25', 10)
    const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : 25
    return this.cron.listRuns(req.user.id, id, safeLimit)
  }
}
