import { Controller, Post, Get, Body, Param } from '@nestjs/common'
import { ProactiveAgentService } from './proactive-agents.service'

@Controller('api/v1/proactive')
export class ProactiveAgentsController {
  constructor(private readonly service: ProactiveAgentService) {}

  @Post('triggers')
  create(@Body() body: any) { return this.service.registerTrigger(body) }

  @Get('triggers/:userId')
  list(@Param('userId') userId: string) { return this.service.listTriggers(userId) }

  @Post('webhook/:source')
  handleWebhook(@Param('source') source: string, @Body() body: any) { 
    return this.service.handleIncomingEvent(source as any, body) 
  }
}
