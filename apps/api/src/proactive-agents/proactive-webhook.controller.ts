import { Body, Controller, Headers, Param, Post, Query, UnauthorizedException } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { timingSafeEqual } from 'node:crypto'
import { ProactiveAgentService } from './proactive-agents.service'
import { Public } from '../common/public.decorator'

/**
 * Webhook entrypoint for external systems (GitHub, Slack, email relays, monitors).
 * Requires X-Proactive-Webhook-Token header (or ?token= query param) matching
 * PROACTIVE_WEBHOOK_TOKEN (fail-closed when unset).
 */
@ApiTags('proactive')
@Public()
@Controller('proactive/webhook')
export class ProactiveWebhookController {
  constructor(private readonly service: ProactiveAgentService) {}

  @Post(':source')
  handleWebhook(
    @Param('source') source: string,
    @Body() body: any,
    @Headers('x-proactive-webhook-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ) {
    this.assertWebhookToken(headerToken ?? queryToken)
    return this.service.handleIncomingEvent(source, body ?? {})
  }

  private assertWebhookToken(token?: string) {
    const expected = (process.env.PROACTIVE_WEBHOOK_TOKEN ?? '').trim()
    if (!expected) {
      throw new UnauthorizedException('PROACTIVE_WEBHOOK_TOKEN is not configured')
    }
    const actual = (token ?? '').trim()
    const expectedBuf = Buffer.from(expected)
    const actualBuf = Buffer.from(actual)
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new UnauthorizedException('Invalid proactive webhook token')
    }
  }
}

