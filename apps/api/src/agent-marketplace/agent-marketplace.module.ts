import { Module } from '@nestjs/common'
import { BillingModule } from '../billing/billing.module'
import { AgentMarketplaceController } from './agent-marketplace.controller'
import { AgentMarketplaceService } from './agent-marketplace.service'
import { PAYMENT_PROVIDER, SimulatedPaymentProvider } from './payment-provider'

@Module({
  imports: [BillingModule],
  controllers: [AgentMarketplaceController],
  providers: [AgentMarketplaceService, { provide: PAYMENT_PROVIDER, useValue: new SimulatedPaymentProvider() }],
  exports: [AgentMarketplaceService],
})
export class AgentMarketplaceModule {}
