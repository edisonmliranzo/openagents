import { Injectable, Logger } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { MetricsService } from '../metrics/metrics.service'
import { TriggersService } from '../triggers/triggers.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import type { RuntimeEvent } from './runtime-event.types'

@Injectable()
export class RuntimeEventsService {
  private readonly logger = new Logger(RuntimeEventsService.name)

  constructor(
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly triggers: TriggersService,
    private readonly webhooks: WebhooksService,
  ) {}

  async publish(event: RuntimeEvent) {
    const normalized: RuntimeEvent = {
      ...event,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      payload: event.payload ?? {},
    }

    const results = await Promise.allSettled([
      this.audit.logEvent(normalized),
      this.metrics.recordEvent(normalized),
      this.triggers.evaluateEvent(normalized),
      this.webhooks.dispatchEvent(normalized),
    ])

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return
      const target = ['audit', 'metrics', 'triggers', 'webhooks'][index] ?? `target_${index}`
      this.logger.warn(`Runtime event "${normalized.name}" fanout failed for ${target}: ${result.reason}`)
    })

    return normalized
  }
}
