import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { BillingController, MarketplaceController } from './billing.controller'
import { BillingService } from './billing.service'
import { BillingStore } from './billing.store'
import { MarketplaceService } from './marketplace.service'
import { MarketplaceStore } from './marketplace.store'
import { StripeClient } from './stripe.client'

@Module({
  imports: [PrismaModule],
  controllers: [BillingController, MarketplaceController],
  providers: [BillingService, BillingStore, StripeClient, MarketplaceStore, MarketplaceService],
  exports: [BillingService, MarketplaceService],
})
export class BillingModule {}
