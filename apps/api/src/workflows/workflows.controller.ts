import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { WorkflowsService } from './workflows.service'
import type {
  CreateWorkflowInput,
  RunWorkflowInput,
  UpdateWorkflowInput,
  WorkflowTriggerKind,
} from '@openagents/shared'

const TRIGGER_KINDS: WorkflowTriggerKind[] = ['manual', 'schedule', 'webhook']

class WorkflowTriggerDto {
  @IsIn(TRIGGER_KINDS)
  kind!: WorkflowTriggerKind

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_080)
  everyMinutes?: number

  @IsOptional()
  @IsString()
  @MaxLength(200)
  webhookSecret?: string
}

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

class CreateWorkflowDto {
  @IsString()
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsObject()
  trigger!: WorkflowTriggerDto

  @IsArray()
  steps!: WorkflowStepDto[]
}

class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsObject()
  trigger?: WorkflowTriggerDto

  @IsOptional()
  @IsArray()
  steps?: WorkflowStepDto[]
}

class RunWorkflowDto implements RunWorkflowInput {
  @IsOptional()
  @IsIn(TRIGGER_KINDS)
  triggerKind?: WorkflowTriggerKind

  @IsOptional()
  @IsString()
  @MaxLength(200)
  webhookSecret?: string
}

@ApiTags('workflows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private workflows: WorkflowsService) {}

  @Get()
  list(@Req() req: any) {
    return this.workflows.list(req.user.id)
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.workflows.get(req.user.id, id)
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateWorkflowDto) {
    return this.workflows.create(req.user.id, dto as unknown as CreateWorkflowInput)
  }

  @Patch(':id')
  patch(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(req.user.id, id, dto as unknown as UpdateWorkflowInput)
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.workflows.remove(req.user.id, id)
  }

  @Post(':id/run')
  run(@Req() req: any, @Param('id') id: string, @Body() dto: RunWorkflowDto) {
    return this.workflows.run(req.user.id, id, dto)
  }

  @Post(':id/webhook')
  webhook(@Req() req: any, @Param('id') id: string, @Body() dto: RunWorkflowDto) {
    return this.workflows.run(req.user.id, id, {
      triggerKind: 'webhook',
      webhookSecret: dto.webhookSecret,
    })
  }

  @Get(':id/runs')
  runs(@Req() req: any, @Param('id') id: string, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '25', 10)
    const safe = Number.isFinite(parsed) ? parsed : 25
    return this.workflows.listRuns(req.user.id, id, safe)
  }
}
