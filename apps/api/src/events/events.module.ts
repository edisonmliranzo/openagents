import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { MetricsModule } from '../metrics/metrics.module'
import { TriggersModule } from '../triggers/triggers.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { RuntimeEventsService } from './runtime-events.service'
import { WsGateway } from './ws.gateway'

@Module({
  imports: [AuditModule, MetricsModule, TriggersModule, WebhooksModule],
  providers: [RuntimeEventsService, WsGateway],
  exports: [RuntimeEventsService, WsGateway],
})
export class EventsModule {}
