import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import * as path from 'path'
import { JsonFile } from './billing.store'

export type MarketplaceItemKind = 'skill' | 'pack'

export interface MarketplacePrice {
  kind: MarketplaceItemKind
  itemId: string
  sellerId: string
  /** Price in minor units (cents). 0 = free. */
  amountCents: number
  currency: string
  title?: string
  updatedAt: string
}

export interface MarketplacePurchase {
  id: string
  kind: MarketplaceItemKind
  itemId: string
  buyerId: string
  sellerId: string
  amountCents: number
  currency: string
  stripeSessionId?: string
  createdAt: string
}

export interface EarningsEntry {
  id: string
  purchaseId: string
  sellerId: string
  kind: MarketplaceItemKind
  itemId: string
  grossCents: number
  platformFeeCents: number
  netCents: number
  currency: string
  status: 'pending_payout' | 'paid'
  createdAt: string
}

interface MarketplaceFile {
  prices: Record<string, MarketplacePrice>
  purchases: MarketplacePurchase[]
  ledger: EarningsEntry[]
}

export const priceKey = (kind: MarketplaceItemKind, itemId: string) => `${kind}:${itemId}`

export function platformFeePct() {
  const raw = Number(process.env.MARKETPLACE_PLATFORM_FEE_PCT)
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 20
}

/** Single JSON file for marketplace prices, purchases and the creator earnings ledger. */
@Injectable()
export class MarketplaceStore {
  private readonly dir = path.resolve(
    process.env.MARKETPLACE_DATA_DIR ?? path.join(process.cwd(), 'data', 'marketplace'),
  )
  private readonly file = new JsonFile<MarketplaceFile>(path.join(this.dir, 'marketplace.json'), () => ({
    prices: {},
    purchases: [],
    ledger: [],
  }))

  async getPrice(kind: MarketplaceItemKind, itemId: string) {
    return (await this.file.read()).prices[priceKey(kind, itemId)] ?? null
  }

  async listPrices(kind?: MarketplaceItemKind) {
    const all = Object.values((await this.file.read()).prices)
    return kind ? all.filter((p) => p.kind === kind) : all
  }

  async setPrice(input: Omit<MarketplacePrice, 'updatedAt'>) {
    const data = await this.file.read()
    const key = priceKey(input.kind, input.itemId)
    if (input.amountCents <= 0) delete data.prices[key]
    else data.prices[key] = { ...input, updatedAt: new Date().toISOString() }
    await this.file.write(data)
    return data.prices[key] ?? null
  }

  async hasPurchased(buyerId: string, kind: MarketplaceItemKind, itemId: string) {
    return (await this.file.read()).purchases.some(
      (p) => p.buyerId === buyerId && p.kind === kind && p.itemId === itemId,
    )
  }

  async listPurchases(buyerId: string) {
    return (await this.file.read()).purchases.filter((p) => p.buyerId === buyerId)
  }

  /** Idempotent on stripeSessionId. Records purchase + ledger entry with the platform fee split. */
  async recordPurchase(input: Omit<MarketplacePurchase, 'id' | 'createdAt'>) {
    const data = await this.file.read()
    if (input.stripeSessionId) {
      const existing = data.purchases.find((p) => p.stripeSessionId === input.stripeSessionId)
      if (existing) return existing
    }
    const purchase: MarketplacePurchase = { ...input, id: randomUUID(), createdAt: new Date().toISOString() }
    const fee = Math.round((input.amountCents * platformFeePct()) / 100)
    data.purchases.push(purchase)
    data.ledger.push({
      id: randomUUID(),
      purchaseId: purchase.id,
      sellerId: input.sellerId,
      kind: input.kind,
      itemId: input.itemId,
      grossCents: input.amountCents,
      platformFeeCents: fee,
      netCents: input.amountCents - fee,
      currency: input.currency,
      status: 'pending_payout',
      createdAt: purchase.createdAt,
    })
    await this.file.write(data)
    return purchase
  }

  async earnings(sellerId: string) {
    const entries = (await this.file.read()).ledger.filter((e) => e.sellerId === sellerId)
    const sum = (k: 'grossCents' | 'platformFeeCents' | 'netCents') => entries.reduce((a, e) => a + e[k], 0)
    return {
      platformFeePct: platformFeePct(),
      totals: {
        grossCents: sum('grossCents'),
        platformFeeCents: sum('platformFeeCents'),
        netCents: sum('netCents'),
        pendingPayoutCents: entries.filter((e) => e.status === 'pending_payout').reduce((a, e) => a + e.netCents, 0),
      },
      entries: entries.slice().reverse(),
    }
  }
}
