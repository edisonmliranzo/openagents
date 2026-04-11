import { Injectable, OnModuleInit } from '@nestjs/common'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { MetricsService } from '../metrics/metrics.service'
import { AuditService } from '../audit/audit.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import { TriggersService } from '../triggers/triggers.service'

@Injectable()
export class GlobalEventListener implements OnModuleInit {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
    private readonly auditService: AuditService,
    private readonly webhooksService: WebhooksService,
    private readonly triggersService: TriggersService,
  ) {}

  onModuleInit() {
    // All events automatically flow through all integrations
  }

  @OnEvent('**', { wildcard: true })
  async handleAllEvents(payload: any, event: string) {
    // 1. Automatically log everything to audit trail
    await this.auditService.logEvent(event, payload)

    // 2. Automatically collect metrics for every event
    await this.metricsService.recordEvent(event, payload)

    // 3. Evaluate trigger conditions against this event
    await this.triggersService.evaluateEvent(event, payload)

    // 4. Deliver to registered webhooks
    await this.webhooksService.dispatchEvent(event, payload)
  }
}