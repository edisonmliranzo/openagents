import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { TriggersService } from './triggers.service'

@Controller('api/v1/triggers')
@UseGuards(JwtAuthGuard)
export class TriggersController {
  constructor(private readonly triggersService: TriggersService) {}

  @Post()
  async create(
    @Request() req: any,
    @Body()
    body: {
      name: string
      description?: string
      event: string
      filter?: any
      actions: { type: string; config: Record<string, unknown> }[]
      workflowId?: string
    },
  ) {
    return this.triggersService.create(req.user.id, {
      name: body.name,
      description: body.description,
      event: body.event as any,
      filter: body.filter,
      actions: body.actions,
      workflowId: body.workflowId,
    })
  }

  @Get()
  async list(@Request() req: any) {
    return this.triggersService.list(req.user.id)
  }

  @Get('events')
  async listEvents() {
    const events = [
      { value: 'email.received', label: 'Email Received' },
      { value: 'calendar.event_created', label: 'Calendar Event Created' },
      { value: 'calendar.event_updated', label: 'Calendar Event Updated' },
      { value: 'calendar.event_reminder', label: 'Calendar Event Reminder' },
      { value: 'webhook.received', label: 'Webhook Received' },
      { value: 'file.created', label: 'File Created' },
      { value: 'file.modified', label: 'File Modified' },
      { value: 'github.pr_opened', label: 'GitHub PR Opened' },
      { value: 'github.pr_merged', label: 'GitHub PR Merged' },
      { value: 'github.issue_created', label: 'GitHub Issue Created' },
      { value: 'slack.message', label: 'Slack Message' },
      { value: 'discord.message', label: 'Discord Message' },
      { value: 'timer.elapsed', label: 'Timer Elapsed' },
      { value: 'approval.completed', label: 'Approval Completed' },
    ]
    return events
  }

  @Get(':id')
  async get(@Request() req: any, @Param('id') id: string) {
    return this.triggersService.get(id, req.user.id)
  }

  @Put(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.triggersService.update(id, req.user.id, {
      name: body.name,
      description: body.description,
      enabled: body.enabled,
      filter: body.filter,
      actions: body.actions,
      workflowId: body.workflowId,
    })
  }

  @Delete(':id')
  async delete(@Request() req: any, @Param('id') id: string) {
    return this.triggersService.delete(id, req.user.id)
  }

  @Get(':id/events')
  async getTriggerEvents(
    @Request() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.triggersService.getTriggerEvents(
      id,
      req.user.id,
      limit ? parseInt(limit) : 50,
    )
  }
}
