import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

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

export const priceKey = (kind: MarketplaceItemKind, itemId: string) => `${kind}:${itemId}`

export function platformFeePct() {
  const raw = Number(process.env.MARKETPLACE_PLATFORM_FEE_PCT)
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 20
}

/**
 * Marketplace prices, purchases and the creator earnings ledger.
 *
 * These were a single JSON file — money on disk, no transactions, and a lost
 * file meant lost revenue records. They are relational now.
 */
@Injectable()
export class MarketplaceStore {
  constructor(private prisma: PrismaService) {}

  async getPrice(kind: MarketplaceItemKind, itemId: string) {
    const row = await this.prisma.marketplacePrice.findUnique({
      where: { kind_itemId: { kind, itemId } },
    })
    if (!row) return null
    return {
      kind: row.kind as MarketplaceItemKind,
      itemId: row.itemId,
      sellerId: row.sellerId,
      amountCents: row.amountCents,
      currency: row.currency,
      title: row.title ?? undefined,
      updatedAt: row.updatedAt.toISOString(),
    } satisfies MarketplacePrice
  }

  async listPrices(kind?: MarketplaceItemKind) {
    const rows = await this.prisma.marketplacePrice.findMany({
      where: kind ? { kind } : undefined,
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => ({
      kind: row.kind as MarketplaceItemKind,
      itemId: row.itemId,
      sellerId: row.sellerId,
      amountCents: row.amountCents,
      currency: row.currency,
      title: row.title ?? undefined,
      updatedAt: row.updatedAt.toISOString(),
    } satisfies MarketplacePrice))
  }

  async setPrice(input: Omit<MarketplacePrice, 'updatedAt'>) {
    if (input.amountCents <= 0) {
      await this.prisma.marketplacePrice
        .deleteMany({ where: { kind: input.kind, itemId: input.itemId } })
        .catch(() => undefined)
      return null
    }

    const row = await this.prisma.marketplacePrice.upsert({
      where: { kind_itemId: { kind: input.kind, itemId: input.itemId } },
      create: {
        kind: input.kind,
        itemId: input.itemId,
        sellerId: input.sellerId,
        amountCents: input.amountCents,
        currency: input.currency,
        title: input.title ?? null,
      },
      update: {
        sellerId: input.sellerId,
        amountCents: input.amountCents,
        currency: input.currency,
        title: input.title ?? null,
      },
    })

    return {
      kind: row.kind as MarketplaceItemKind,
      itemId: row.itemId,
      sellerId: row.sellerId,
      amountCents: row.amountCents,
      currency: row.currency,
      title: row.title ?? undefined,
      updatedAt: row.updatedAt.toISOString(),
    } satisfies MarketplacePrice
  }

  async hasPurchased(buyerId: string, kind: MarketplaceItemKind, itemId: string) {
    const row = await this.prisma.marketplacePurchase.findFirst({
      where: { buyerId, kind, itemId },
      select: { id: true },
    })
    return Boolean(row)
  }

  async listPurchases(buyerId: string) {
    const rows = await this.prisma.marketplacePurchase.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((row) => this.toPurchase(row))
  }

  /** Idempotent on stripeSessionId. Records purchase + ledger entry with the platform fee split. */
  async recordPurchase(input: Omit<MarketplacePurchase, 'id' | 'createdAt'>) {
    if (input.stripeSessionId) {
      const existing = await this.prisma.marketplacePurchase.findFirst({
        where: { stripeSessionId: input.stripeSessionId },
      })
      if (existing) return this.toPurchase(existing)
    }

    const fee = Math.round((input.amountCents * platformFeePct()) / 100)
    const id = randomUUID()

    const purchase = await this.prisma.marketplacePurchase.create({
      data: {
        id,
        kind: input.kind,
        itemId: input.itemId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        amountCents: input.amountCents,
        currency: input.currency,
        stripeSessionId: input.stripeSessionId ?? null,
        earnings: {
          create: {
            id: randomUUID(),
            sellerId: input.sellerId,
            kind: input.kind,
            itemId: input.itemId,
            grossCents: input.amountCents,
            platformFeeCents: fee,
            netCents: input.amountCents - fee,
            currency: input.currency,
            status: 'pending_payout',
          },
        },
      },
    })

    return this.toPurchase(purchase)
  }

  async earnings(sellerId: string) {
    const entries = await this.prisma.marketplaceEarning.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    })

    const mapped = entries.map((row) => ({
      id: row.id,
      purchaseId: row.purchaseId,
      sellerId: row.sellerId,
      kind: row.kind as MarketplaceItemKind,
      itemId: row.itemId,
      grossCents: row.grossCents,
      platformFeeCents: row.platformFeeCents,
      netCents: row.netCents,
      currency: row.currency,
      status: row.status as EarningsEntry['status'],
      createdAt: row.createdAt.toISOString(),
    } satisfies EarningsEntry))

    const sum = (k: 'grossCents' | 'platformFeeCents' | 'netCents') =>
      mapped.reduce((a, e) => a + e[k], 0)

    return {
      platformFeePct: platformFeePct(),
      totals: {
        grossCents: sum('grossCents'),
        platformFeeCents: sum('platformFeeCents'),
        netCents: sum('netCents'),
        pendingPayoutCents: mapped
          .filter((e) => e.status === 'pending_payout')
          .reduce((a, e) => a + e.netCents, 0),
      },
      entries: mapped,
    }
  }

  private toPurchase(row: {
    id: string
    kind: string
    itemId: string
    buyerId: string
    sellerId: string
    amountCents: number
    currency: string
    stripeSessionId: string | null
    createdAt: Date
  }): MarketplacePurchase {
    return {
      id: row.id,
      kind: row.kind as MarketplaceItemKind,
      itemId: row.itemId,
      buyerId: row.buyerId,
      sellerId: row.sellerId,
      amountCents: row.amountCents,
      currency: row.currency,
      stripeSessionId: row.stripeSessionId ?? undefined,
      createdAt: row.createdAt.toISOString(),
    }
  }
}
