import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotImplementedException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IsIn, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { Public } from '../common/public.decorator'
import { BillingService } from './billing.service'
import { MarketplaceService } from './marketplace.service'
import type { MarketplaceItemKind } from './marketplace.store'

class CheckoutDto {
  @IsIn(['pro', 'team'])
  plan!: 'pro' | 'team'
}

class MarketplaceCheckoutDto {
  @IsIn(['skill', 'pack'])
  kind!: MarketplaceItemKind

  @IsString()
  itemId!: string
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('plan')
  plan(@Req() req: any) {
    return this.billing.getPlan(req.user.id)
  }

  @UseGuards(JwtAuthGuard)
  @Get('usage')
  usage(@Req() req: any) {
    return this.billing.getUsage(req.user.id)
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  checkout(@Req() req: any, @Body() dto: CheckoutDto) {
    return this.billing.createCheckout(req.user.id, dto.plan)
  }

  @UseGuards(JwtAuthGuard)
  @Post('portal')
  portal(@Req() req: any) {
    return this.billing.createPortal(req.user.id)
  }

  /** Stripe webhook. Requires NestFactory.create(AppModule, { rawBody: true }) so req.rawBody is populated. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: any, @Headers('stripe-signature') signature?: string) {
    return this.billing.handleWebhook(req.rawBody, signature)
  }
}

@ApiTags('marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly billing: BillingService,
    private readonly marketplace: MarketplaceService,
  ) {}

  @Get('prices')
  prices() {
    return this.marketplace.listPrices()
  }

  @Get('purchases')
  purchases(@Req() req: any) {
    return this.marketplace.listPurchases(req.user.id)
  }

  @Post('checkout')
  checkout(@Req() req: any, @Body() dto: MarketplaceCheckoutDto) {
    return this.billing.createMarketplaceCheckout(req.user.id, dto.kind, dto.itemId)
  }

  @Get('earnings')
  earnings(@Req() req: any) {
    return this.marketplace.earnings(req.user.id)
  }

  /** NOT IMPLEMENTED: Stripe Connect payouts to creators are a stub. */
  @Post('payouts')
  payouts() {
    throw new NotImplementedException(
      'Stripe Connect payouts are not implemented yet. Earnings accrue in the ledger as pending_payout.',
    )
  }
}
