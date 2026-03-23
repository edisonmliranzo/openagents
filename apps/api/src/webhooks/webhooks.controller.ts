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
import { WebhooksService } from './webhooks.service'
import { WebhookEventType, CreateWebhookDto, UpdateWebhookDto } from '@openagents/shared'

@Controller('api/v1/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  async create(@Request() req: any, @Body() body: CreateWebhookDto) {
    return this.webhooksService.create(
      req.user.id,
      body.url,
      body.events as WebhookEventType[],
      body.secret,
      body.headers,
    )
  }

  @Get()
  async list(@Request() req: any) {
    return this.webhooksService.list(req.user.id)
  }

  @Get('events')
  async listEvents() {
    const events: { value: WebhookEventType; label: string }[] = [
      { value: 'agent.run.completed', label: 'Agent Run Completed' },
      { value: 'agent.run.failed', label: 'Agent Run Failed' },
      { value: 'approval.pending', label: 'Approval Pending' },
      { value: 'approval.approved', label: 'Approval Approved' },
      { value: 'approval.denied', label: 'Approval Denied' },
      { value: 'tool.executed', label: 'Tool Executed' },
      { value: 'tool.failed', label: 'Tool Failed' },
      { value: 'conversation.started', label: 'Conversation Started' },
      { value: 'conversation.message', label: 'Conversation Message' },
      { value: 'workflow.started', label: 'Workflow Started' },
      { value: 'workflow.completed', label: 'Workflow Completed' },
      { value: 'workflow.failed', label: 'Workflow Failed' },
      { value: 'memory.created', label: 'Memory Created' },
      { value: 'memory.updated', label: 'Memory Updated' },
      { value: 'user.login', label: 'User Login' },
      { value: 'user.registered', label: 'User Registered' },
      { value: 'error.occurred', label: 'Error Occurred' },
    ]
    return events
  }

  @Get(':id')
  async get(@Request() req: any, @Param('id') id: string) {
    return this.webhooksService.get(id, req.user.id)
  }

  @Put(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateWebhookDto,
  ) {
    return this.webhooksService.update(id, req.user.id, {
      url: body.url,
      events: body.events as WebhookEventType[],
      secret: body.secret,
      enabled: body.enabled,
      headers: body.headers,
    })
  }

  @Delete(':id')
  async delete(@Request() req: any, @Param('id') id: string) {
    return this.webhooksService.delete(id, req.user.id)
  }

  @Get(':id/deliveries')
  async getDeliveries(
    @Request() req: any,
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
  ) {
    return this.webhooksService.getDeliveries(id, req.user.id, {
      take: take ? parseInt(take) : undefined,
      status,
    })
  }

  @Get(':id/deliveries/stats')
  async getDeliveryStats(@Request() req: any, @Param('id') id: string) {
    return this.webhooksService.getDeliveryStats(id, req.user.id)
  }

  @Post(':id/deliveries/:deliveryId/retry')
  async retryDelivery(
    @Request() req: any,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.webhooksService.retryDelivery(deliveryId, req.user.id)
  }

  @Post(':id/test')
  async testWebhook(@Request() req: any, @Param('id') id: string) {
    return this.webhooksService.testWebhook(id, req.user.id)
  }
}
