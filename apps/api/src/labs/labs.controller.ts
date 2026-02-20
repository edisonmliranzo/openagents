import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { LabsService } from './labs.service'
import type { AgentFeatureId, AgentGoalPriority, AgentGoalStatus, AgentSafetyTier } from '@openagents/shared'

const FEATURE_IDS: AgentFeatureId[] = [
  'voice_mode',
  'goal_board',
  'autonomous_followups',
  'memory_controls',
  'decision_journal',
  'skill_marketplace',
  'simulation_sandbox',
  'multi_provider_failover',
  'tool_permissions_scope',
  'conversation_project_mode',
  'persona_presets',
  'realtime_observability',
  'self_healing_runs',
  'smart_code_actions',
  'safety_tiers',
  'benchmark_lab',
  'daily_briefings',
  'web_knowledge_pack',
  'team_mode',
  'mobile_companion',
]

const GOAL_PRIORITIES: AgentGoalPriority[] = ['low', 'medium', 'high', 'critical']
const GOAL_STATUSES: AgentGoalStatus[] = ['todo', 'doing', 'blocked', 'done']
const SAFETY_TIERS: AgentSafetyTier[] = ['strict', 'balanced', 'fast']
const RISKS = ['low', 'medium', 'high'] as const

class ToggleFeatureDto {
  @IsBoolean()
  enabled!: boolean
}

class SetSafetyTierDto {
  @IsIn(SAFETY_TIERS)
  safetyTier!: AgentSafetyTier
}

class CreateGoalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string

  @IsOptional()
  @IsIn(GOAL_PRIORITIES)
  priority?: AgentGoalPriority
}

class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string

  @IsOptional()
  @IsIn(GOAL_PRIORITIES)
  priority?: AgentGoalPriority

  @IsOptional()
  @IsIn(GOAL_STATUSES)
  status?: AgentGoalStatus
}

class LogDecisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  summary!: string

  @IsArray()
  @IsString({ each: true })
  options!: string[]

  @IsString()
  @MinLength(1)
  @MaxLength(220)
  selected!: string

  @IsIn(RISKS)
  risk!: 'low' | 'medium' | 'high'

  @IsNumber()
  confidence!: number
}

@ApiTags('labs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('labs')
export class LabsController {
  constructor(private labs: LabsService) {}

  @Get()
  snapshot(@Req() req: any) {
    return this.labs.snapshot(req.user.id)
  }

  @Patch('features/:featureId')
  toggleFeature(@Req() req: any, @Param('featureId') featureId: AgentFeatureId, @Body() dto: ToggleFeatureDto) {
    if (!FEATURE_IDS.includes(featureId)) {
      throw new BadRequestException(`Unsupported feature id: ${featureId}`)
    }
    return this.labs.toggleFeature(req.user.id, featureId, dto.enabled)
  }

  @Patch('safety-tier')
  setSafetyTier(@Req() req: any, @Body() dto: SetSafetyTierDto) {
    return this.labs.setSafetyTier(req.user.id, dto.safetyTier)
  }

  @Post('goals')
  createGoal(@Req() req: any, @Body() dto: CreateGoalDto) {
    return this.labs.createGoal(req.user.id, dto)
  }

  @Patch('goals/:goalId')
  updateGoal(@Req() req: any, @Param('goalId') goalId: string, @Body() dto: UpdateGoalDto) {
    return this.labs.updateGoal(req.user.id, goalId, dto)
  }

  @Delete('goals/:goalId')
  deleteGoal(@Req() req: any, @Param('goalId') goalId: string) {
    return this.labs.deleteGoal(req.user.id, goalId)
  }

  @Post('decision-journal')
  logDecision(@Req() req: any, @Body() dto: LogDecisionDto) {
    return this.labs.logDecision(req.user.id, {
      summary: dto.summary,
      options: dto.options,
      selected: dto.selected,
      risk: dto.risk,
      confidence: dto.confidence,
    })
  }

  @Post('briefing')
  briefing(@Req() req: any) {
    return this.labs.briefing(req.user.id)
  }
}
