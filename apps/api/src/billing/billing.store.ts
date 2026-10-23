import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { PlanId, UsageMetric } from './billing.plans'

export interface UserBillingFile {
  plan: PlanId
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  subscriptionStatus?: string
  currentPeriodEnd?: string
  /** dateKey (YYYY-MM-DD UTC) -> metric -> count; monthly metrics use YYYY-MM keys. */
  usage: Record<string, Partial<Record<UsageMetric, number>>>
  updatedAt: string
}

const MAX_USAGE_KEYS = 62

export function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Billing state (plan, Stripe ids, usage counters) now lives in Postgres
 * instead of a JSON file per user.
 */
@Injectable()
export class BillingStore {
  private readonly logger = new Logger(BillingStore.name)

  constructor(private prisma: PrismaService) {}

  private toFile(row: {
    plan: string
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    subscriptionStatus: string | null
    currentPeriodEnd: string | null
    usage: unknown
    updatedAt: Date
  }): UserBillingFile {
    return {
      plan: (row.plan as PlanId) ?? 'free',
      stripeCustomerId: row.stripeCustomerId ?? undefined,
      stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
      subscriptionStatus: row.subscriptionStatus ?? undefined,
      currentPeriodEnd: row.currentPeriodEnd ?? undefined,
      usage: (row.usage as UserBillingFile['usage']) ?? {},
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async get(userId: string): Promise<UserBillingFile> {
    const row = await this.prisma.userBilling.findUnique({ where: { userId } })
    if (!row) {
      return {
        plan: 'free',
        usage: {},
        updatedAt: new Date().toISOString(),
      }
    }
    return this.toFile(row)
  }

  async update(
    userId: string,
    mutate: (rec: UserBillingFile) => void,
  ): Promise<UserBillingFile> {
    const rec = await this.get(userId)
    mutate(rec)

    const keys = Object.keys(rec.usage).sort()
    while (keys.length > MAX_USAGE_KEYS) delete rec.usage[keys.shift()!]
    rec.updatedAt = new Date().toISOString()

    const row = await this.prisma.userBilling.upsert({
      where: { userId },
      create: {
        userId,
        plan: rec.plan,
        stripeCustomerId: rec.stripeCustomerId ?? null,
        stripeSubscriptionId: rec.stripeSubscriptionId ?? null,
        subscriptionStatus: rec.subscriptionStatus ?? null,
        currentPeriodEnd: rec.currentPeriodEnd ?? null,
        usage: JSON.parse(JSON.stringify(rec.usage)),
      },
      update: {
        plan: rec.plan,
        stripeCustomerId: rec.stripeCustomerId ?? null,
        stripeSubscriptionId: rec.stripeSubscriptionId ?? null,
        subscriptionStatus: rec.subscriptionStatus ?? null,
        currentPeriodEnd: rec.currentPeriodEnd ?? null,
        usage: JSON.parse(JSON.stringify(rec.usage)),
      },
    })

    return this.toFile(row)
  }

  async linkCustomer(customerId: string, userId: string) {
    await this.prisma.billingCustomer.upsert({
      where: { customerId },
      create: { customerId, userId },
      update: { userId },
    })
  }

  async userForCustomer(customerId: string) {
    const row = await this.prisma.billingCustomer.findUnique({ where: { customerId } })
    return row?.userId ?? null
  }
}
