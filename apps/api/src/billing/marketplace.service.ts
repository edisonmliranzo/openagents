import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { MarketplaceItemKind, MarketplaceStore } from './marketplace.store'

const MAX_PRICE_CENTS = 100_000_00

@Injectable()
export class MarketplaceService {
  constructor(private readonly store: MarketplaceStore) {}

  getPrice(kind: MarketplaceItemKind, itemId: string) {
    return this.store.getPrice(kind, itemId)
  }

  listPrices(kind?: MarketplaceItemKind) {
    return this.store.listPrices(kind)
  }

  /** Caller must have verified that sellerId owns the item. */
  async setPrice(sellerId: string, kind: MarketplaceItemKind, itemId: string, amountCents: number, currency = 'usd', title?: string) {
    const existing = await this.store.getPrice(kind, itemId)
    if (existing && existing.sellerId !== sellerId) throw new ForbiddenException('Only the publisher can change the price.')
    const cents = Math.round(Number(amountCents) || 0)
    if (cents < 0 || cents > MAX_PRICE_CENTS) throw new HttpException('Invalid price.', HttpStatus.BAD_REQUEST)
    if (cents > 0 && cents < 50) throw new HttpException('Minimum price is 50 cents.', HttpStatus.BAD_REQUEST)
    return this.store.setPrice({
      kind,
      itemId,
      sellerId,
      amountCents: cents,
      currency: (currency || 'usd').toLowerCase().slice(0, 3),
      title: title?.slice(0, 120),
    })
  }

  /** Returns access state for a user. */
  async access(userId: string, kind: MarketplaceItemKind, itemId: string) {
    const price = await this.store.getPrice(kind, itemId)
    if (!price) return { price: null, purchased: false, canInstall: true }
    const purchased = price.sellerId === userId || (await this.store.hasPurchased(userId, kind, itemId))
    return { price, purchased, canInstall: purchased }
  }

  /** Throw 402 if the item is paid and the user has not bought it. */
  async assertCanInstall(userId: string, kind: MarketplaceItemKind, itemId: string) {
    const { canInstall, price } = await this.access(userId, kind, itemId)
    if (!canInstall) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'PurchaseRequired',
          message: 'This item must be purchased before it can be installed.',
          price,
        },
        HttpStatus.PAYMENT_REQUIRED,
      )
    }
  }

  listPurchases(userId: string) {
    return this.store.listPurchases(userId)
  }

  earnings(userId: string) {
    return this.store.earnings(userId)
  }
}
