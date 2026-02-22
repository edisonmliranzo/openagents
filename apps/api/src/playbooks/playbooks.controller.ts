import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PlaybooksService } from './playbooks.service'
import type {
  CreatePlaybookInput,
  PlaybookParamType,
  PlaybookTargetKind,
  RunPlaybookInput,
  UpdatePlaybookInput,
} from '@openagents/shared'

const TARGET_KINDS: PlaybookTargetKind[] = ['agent_prompt', 'workflow']
const PARAM_TYPES: PlaybookParamType[] = ['text', 'number', 'boolean']

class WorkflowStepDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  id?: string

  @IsString()
  @IsIn(['agent_prompt', 'tool_call', 'delay'])
  type!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string

  @IsOptional()
  @IsString()
  prompt?: string

  @IsOptional()
  @IsString()
  toolName?: string

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(300_000)
  delayMs?: number

  @IsOptional()
  @IsString()
  conversationId?: string
}

class PlaybookParameterDto {
  @IsString()
  @MaxLength(64)
  key!: string

  @IsString()
  @MaxLength(120)
  label!: string

  @IsIn(PARAM_TYPES)
  type!: PlaybookParamType

  @IsBoolean()
  required!: boolean

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string

  @IsOptional()
  defaultValue?: string | number | boolean
}

class PlaybookWorkflowTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsArray()
  steps!: WorkflowStepDto[]
}

class CreatePlaybookDto {
  @IsString()
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null

  @IsIn(TARGET_KINDS)
  targetKind!: PlaybookTargetKind

  @IsOptional()
  @IsArray()
  parameterSchema?: PlaybookParameterDto[]

  @IsOptional()
  @IsString()
  promptTemplate?: string | null

  @IsOptional()
  @IsObject()
  workflowTemplate?: PlaybookWorkflowTemplateDto | null
}

class UpdatePlaybookDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null

  @IsOptional()
  @IsIn(TARGET_KINDS)
  targetKind?: PlaybookTargetKind

  @IsOptional()
  @IsArray()
  parameterSchema?: PlaybookParameterDto[]

  @IsOptional()
  @IsString()
  promptTemplate?: string | null

  @IsOptional()
  @IsObject()
  workflowTemplate?: PlaybookWorkflowTemplateDto | null
}

class RunPlaybookDto implements RunPlaybookInput {
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>
}

@ApiTags('playbooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('playbooks')
export class PlaybooksController {
  constructor(private playbooks: PlaybooksService) {}

  @Get()
  list(@Req() req: any) {
    return this.playbooks.list(req.user.id)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.playbooks.get(req.user.id, id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreatePlaybookDto) {
    return this.playbooks.create(req.user.id, dto as unknown as CreatePlaybookInput)
  }

  @Patch(':id')
  patch(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePlaybookDto) {
    return this.playbooks.update(req.user.id, id, dto as unknown as UpdatePlaybookInput)
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.playbooks.remove(req.user.id, id)
  }

  @Post(':id/run')
  run(@Req() req: any, @Param('id') id: string, @Body() dto: RunPlaybookDto) {
    return this.playbooks.run(req.user.id, id, dto)
  }

  @Get(':id/runs')
  runs(@Req() req: any, @Param('id') id: string, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '25', 10)
    const safe = Number.isFinite(parsed) ? parsed : 25
    return this.playbooks.listRuns(req.user.id, id, safe)
  }
}
