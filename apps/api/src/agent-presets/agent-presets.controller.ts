import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { AgentPresetsService } from './agent-presets.service'

class AgentPresetPolicyDto {
  @IsOptional()
  @IsString()
  defaultDecision?: 'auto' | 'confirm' | 'block'

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvalScopes?: Array<'local' | 'external_read' | 'external_write' | 'system_mutation'>

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedTools?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requireApprovalTools?: string[]

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxAutonomySteps?: number
}

class AgentPresetSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  preferredProvider?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredModel?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  customSystemPrompt?: string
}

class CreateAgentPresetDto {
  @IsOptional()
  @IsString()
  workspaceId?: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  outputStyle?: string

  @IsOptional()
  @IsString()
  autonomyMode?: 'assist' | 'copilot' | 'autonomous'

  @IsOptional()
  @IsString()
  visibility?: 'private' | 'workspace' | 'public'

  @IsOptional()
  @IsObject()
  settings?: AgentPresetSettingsDto

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledSkills?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tools?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  connectorIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedWorkflowIds?: string[]

  @IsOptional()
  @IsObject()
  policy?: AgentPresetPolicyDto
}

class UpdateAgentPresetDto {
  @IsOptional()
  @IsString()
  workspaceId?: string | null

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  outputStyle?: string | null

  @IsOptional()
  @IsString()
  autonomyMode?: 'assist' | 'copilot' | 'autonomous'

  @IsOptional()
  @IsString()
  visibility?: 'private' | 'workspace' | 'public'

  @IsOptional()
  @IsObject()
  settings?: AgentPresetSettingsDto

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledSkills?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tools?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  connectorIds?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedWorkflowIds?: string[]

  @IsOptional()
  @IsObject()
  policy?: AgentPresetPolicyDto
}

@ApiTags('agent-presets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent-presets')
export class AgentPresetsController {
  constructor(private readonly presets: AgentPresetsService) {}

  @Get()
  list(@Req() req: any) {
    return this.presets.list(req.user.id)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.presets.get(req.user.id, id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateAgentPresetDto) {
    return this.presets.create(req.user.id, dto)
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAgentPresetDto) {
    return this.presets.update(req.user.id, id, dto)
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.presets.remove(req.user.id, id)
  }

  @Post(':id/apply')
  apply(@Req() req: any, @Param('id') id: string) {
    return this.presets.apply(req.user.id, id)
  }
}
