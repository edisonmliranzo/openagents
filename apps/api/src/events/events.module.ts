import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { MetricsModule } from '../metrics/metrics.module'
import { TriggersModule } from '../triggers/triggers.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { RuntimeEventsService } from './runtime-events.service'

@Module({
  imports: [AuditModule, MetricsModule, TriggersModule, WebhooksModule],
  providers: [RuntimeEventsService],
  exports: [RuntimeEventsService],
})
export class EventsModule {}
