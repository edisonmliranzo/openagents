import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { NanobotService } from './nanobot.service'

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

class SetPersonaProfileDto {
  @IsString()
  @MinLength(1)
  profileId: string
}

class SetPersonaBoundariesDto {
  @IsArray()
  @IsString({ each: true })
  boundaries: string[]
}

class ExportMarketplaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillIds?: string[]

  @IsOptional()
  @IsBoolean()
  includeOnlyEnabled?: boolean

  @IsOptional()
  @IsString()
  personaProfileId?: string
}

class SelfHealCronDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  maxRetries?: number

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(10_080)
  staleAfterMinutes?: number
}

class ImportMarketplaceDto {
  @IsObject()
  pack: Record<string, unknown>
}

class VoiceTranscribeDto {
  @IsString()
  @IsOptional()
  transcript?: string

  @IsString()
  @IsOptional()
  audioBase64?: string

  @IsString()
  @IsOptional()
  locale?: string
}

class VoiceSpeakDto {
  @IsString()
  @MinLength(1)
  text: string

  @IsString()
  @IsOptional()
  voice?: string

  @IsString()
  @IsOptional()
  locale?: string

  @IsNumber()
  @IsOptional()
  rate?: number

  @IsNumber()
  @IsOptional()
  pitch?: number
}

class AutonomyWindowDto {
  @IsString()
  @IsOptional()
  label?: string

  @IsArray()
  @IsInt({ each: true })
  days: number[]

  @IsString()
  start: string

  @IsString()
  end: string
}

class UpdateAutonomyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  timezone?: string

  @IsOptional()
  @IsArray()
  windows?: AutonomyWindowDto[]
}

@ApiTags('nanobot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('nanobot')
export class NanobotController {
  constructor(private nanobot: NanobotService) {}

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

  @Get('persona/profiles')
  personaProfiles() {
    return this.nanobot.listPersonaProfiles()
  }

  @Patch('persona/profile')
  setPersonaProfile(@Req() req: any, @Body() dto: SetPersonaProfileDto) {
    return this.nanobot.setPersonaProfile(req.user.id, dto.profileId.trim())
  }

  @Patch('persona/boundaries')
  setPersonaBoundaries(@Req() req: any, @Body() dto: SetPersonaBoundariesDto) {
    return this.nanobot.setPersonaBoundaries(req.user.id, dto.boundaries)
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

  @Get('cron/health')
  cronHealth(@Req() req: any, @Query('staleAfterMinutes') staleAfterMinutes?: string) {
    const parsed = Number.parseInt(staleAfterMinutes ?? '1440', 10)
    const safe = Number.isFinite(parsed) ? parsed : 1440
    return this.nanobot.cronHealth(req.user.id, safe)
  }

  @Post('cron/self-heal')
  cronSelfHeal(@Req() req: any, @Body() dto: SelfHealCronDto) {
    return this.nanobot.cronSelfHeal(req.user.id, {
      maxRetries: dto.maxRetries,
      staleAfterMinutes: dto.staleAfterMinutes,
    })
  }

  @Post('heartbeat')
  heartbeatTick(@Req() req: any) {
    return this.nanobot.heartbeatTick(req.user.id)
  }

  @Post('presence/tick')
  presenceTick(@Req() req: any) {
    return this.nanobot.tickPresence(req.user.id)
  }

  @Get('marketplace/packs')
  marketplacePacks(@Req() req: any) {
    return this.nanobot.listMarketplacePacks(req.user.id)
  }

  @Post('marketplace/packs/:packId/install')
  installMarketplacePack(@Req() req: any, @Param('packId') packId: string) {
    return this.nanobot.installMarketplacePack(req.user.id, packId)
  }

  @Post('marketplace/export')
  exportMarketplacePack(@Req() req: any, @Body() dto: ExportMarketplaceDto) {
    return this.nanobot.exportMarketplacePack(req.user.id, dto)
  }

  @Post('marketplace/verify')
  verifyMarketplacePack(@Body() dto: ImportMarketplaceDto) {
    return this.nanobot.verifyMarketplacePack(dto as any)
  }

  @Post('marketplace/import')
  importMarketplacePack(@Req() req: any, @Body() dto: ImportMarketplaceDto) {
    return this.nanobot.importMarketplacePack(req.user.id, dto as any)
  }

  @Get('orchestration/runs')
  orchestrationRuns(@Req() req: any, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '20', 10)
    const safe = Number.isFinite(parsed) ? parsed : 20
    return this.nanobot.listOrchestrationRuns(req.user.id, safe)
  }

  @Get('orchestration/runs/:runId')
  orchestrationRun(@Req() req: any, @Param('runId') runId: string) {
    return this.nanobot.getOrchestrationRun(req.user.id, runId)
  }

  @Post('voice/transcribe')
  transcribe(@Req() req: any, @Body() dto: VoiceTranscribeDto) {
    return this.nanobot.transcribeVoice(req.user.id, dto)
  }

  @Post('voice/speak')
  speak(@Req() req: any, @Body() dto: VoiceSpeakDto) {
    return this.nanobot.speakVoice(req.user.id, dto)
  }

  @Get('autonomy/windows')
  autonomyWindows(@Req() req: any) {
    return this.nanobot.getAutonomyWindows(req.user.id)
  }

  @Put('autonomy/windows')
  updateAutonomyWindows(@Req() req: any, @Body() dto: UpdateAutonomyDto) {
    return this.nanobot.updateAutonomyWindows(req.user.id, dto)
  }

  @Get('autonomy/status')
  autonomyStatus(@Req() req: any) {
    return this.nanobot.getAutonomyStatus(req.user.id)
  }

  @Post('memory/curate')
  memoryCurate(@Req() req: any) {
    return this.nanobot.curateMemory(req.user.id)
  }

  @Get('trust')
  trust(@Req() req: any) {
    return this.nanobot.trustSnapshot(req.user.id)
  }
}
