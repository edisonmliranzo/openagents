import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { NanobotService } from './nanobot.service'
import { NanobotHeartbeatService } from './heartbeat/nanobot-heartbeat.service'

class UpdateNanobotConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(64)
  maxLoopSteps?: number

  @IsOptional()
  @IsBoolean()
  shadowMode?: boolean

  @IsOptional()
  @IsString()
  runtimeLabel?: string
}

class TriggerCronDto {
  @IsString()
  @MinLength(1)
  jobName: string
}

@ApiTags('nanobot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nanobot')
export class NanobotController {
  constructor(
    private nanobot: NanobotService,
    private heartbeat: NanobotHeartbeatService,
  ) {}

  @Get('health')
  health(@Req() req: any) {
    return this.nanobot.health(req.user.id)
  }

  @Patch('config')
  updateConfig(@Body() dto: UpdateNanobotConfigDto) {
    return this.nanobot.updateConfig(dto)
  }

  @Get('events')
  events(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 60
    return this.nanobot.events(parsed)
  }

  @Get('skills')
  skills(@Req() req: any) {
    return this.nanobot.listSkills(req.user.id)
  }

  @Post('skills/:skillId/enable')
  enableSkill(@Req() req: any, @Param('skillId') skillId: string) {
    return this.nanobot.setSkillEnabled(req.user.id, skillId, true)
  }

  @Post('skills/:skillId/disable')
  disableSkill(@Req() req: any, @Param('skillId') skillId: string) {
    return this.nanobot.setSkillEnabled(req.user.id, skillId, false)
  }

  @Post('cron/trigger')
  triggerCron(@Req() req: any, @Body() dto: TriggerCronDto) {
    return this.nanobot.triggerCron(req.user.id, dto.jobName.trim())
  }

  @Post('heartbeat')
  heartbeatTick(@Req() req: any) {
    return this.heartbeat.tick(req.user.id)
  }
}
