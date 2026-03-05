import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import type { WorkflowTriggerKind } from '@openagents/shared'
import { WorkflowsService } from './workflows.service'

class ProcessWorkflowRunDto {
  @IsString()
  @MaxLength(120)
  userId!: string

  @IsString()
  @MaxLength(120)
  workflowId!: string

  @IsString()
  @MaxLength(120)
  runId!: string

  @IsIn(['manual', 'schedule', 'webhook', 'inbox_event'])
  triggerKind!: WorkflowTriggerKind

  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceEvent?: string
}

@ApiTags('workflows')
@Controller('workflows/internal')
export class WorkflowsInternalController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post('process')
  process(
    @Body() dto: ProcessWorkflowRunDto,
    @Headers('x-workflow-worker-token') token?: string,
  ) {
    this.assertToken(token)
    return this.workflows.processQueuedRun(dto)
  }

  private assertToken(token?: string) {
    const expected = (process.env.WORKFLOW_WORKER_TOKEN ?? '').trim()
    if (!expected) return
    if ((token ?? '').trim() !== expected) {
      throw new UnauthorizedException('Invalid workflow worker token')
    }
  }
}
