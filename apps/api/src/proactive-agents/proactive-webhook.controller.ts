import { Body, Controller, Param, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ProactiveAgentService } from './proactive-agents.service'

/**
 * Unauthenticated webhook entrypoint for external systems (GitHub, Slack,
 * email relays, monitors). Only fires triggers the user explicitly created
 * for the given source; no data is returned beyond match/fire counts.
 */
import { Public } from '../common/public.decorator'
@ApiTags('proactive')
@Public()
@Controller('proactive/webhook')
export class ProactiveWebhookController {
  constructor(private readonly service: ProactiveAgentService) {}

  @Post(':source')
  handleWebhook(@Param('source') source: string, @Body() body: any) {
    return this.service.handleIncomingEvent(source, body ?? {})
  }
}
