import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { METRIC_PERIOD, PLANS, PlanId, PlanLimits, UNCONFIGURED_LIMITS, UNLIMITED, UsageMetric } from './billing.plans'
import { BillingStore } from './billing.store'
import { MarketplaceItemKind, MarketplaceStore } from './marketplace.store'
import { StripeClient } from './stripe.client'

const UNLIMITED_ROLES = new Set(['owner'])

export function webBaseUrl() {
  const first = (process.env.FRONTEND_URLS ?? '').split(',').map((s) => s.trim()).find(Boolean)
  return (first || `http://localhost:${process.env.WEB_PORT || 3000}`).replace(/\/+$/, '')
}

function periodKey(metric: UsageMetric, now = new Date()) {
  const iso = now.toISOString()
  const period = METRIC_PERIOD[metric]
  if (period === 'month') return iso.slice(0, 7)
  if (period === 'absolute') return 'total'
  return iso.slice(0, 10)
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: BillingStore,
    private readonly stripe: StripeClient,
    private readonly marketplace: MarketplaceStore,
  ) {}

  get configured() {
    return this.stripe.configured
  }

  private priceFor(plan: PlanId) {
    if (plan === 'pro') return process.env.STRIPE_PRICE_PRO?.trim() || ''
    if (plan === 'team') return process.env.STRIPE_PRICE_TEAM?.trim() || ''
    return ''
  }

  private async isUnlimited(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    return Boolean(user && UNLIMITED_ROLES.has(user.role))
  }

  async effective(userId: string): Promise<{ plan: PlanId; limits: PlanLimits; unlimited: boolean }> {
    const unlimited = await this.isUnlimited(userId)
    if (!this.configured) return { plan: 'free', limits: UNCONFIGURED_LIMITS, unlimited }
    const rec = await this.store.get(userId)
    const active = !rec.subscriptionStatus || ['active', 'trialing', 'past_due'].includes(rec.subscriptionStatus)
    const plan: PlanId = active ? rec.plan : 'free'
    return { plan, limits: PLANS[plan].limits, unlimited }
  }

  async getPlan(userId: string) {
    const eff = await this.effective(userId)
    const rec = await this.store.get(userId)
    return {
      configured: this.configured,
      plan: eff.plan,
      unlimited: eff.unlimited,
      limits: eff.limits,
      subscriptionStatus: rec.subscriptionStatus ?? null,
      currentPeriodEnd: rec.currentPeriodEnd ?? null,
      hasCustomer: Boolean(rec.stripeCustomerId),
      plans: Object.values(PLANS).map((p) => ({
        ...p,
        purchasable: this.configured && p.id !== 'free' && Boolean(this.priceFor(p.id)),
      })),
    }
  }

  async getUsage(userId: string) {
    const eff = await this.effective(userId)
    const rec = await this.store.get(userId)
    const metrics = (Object.keys(METRIC_PERIOD) as UsageMetric[]).map((metric) => {
      const used = rec.usage[periodKey(metric)]?.[metric] ?? 0
      const limit = eff.unlimited ? UNLIMITED : eff.limits[metric]
      return { metric, period: METRIC_PERIOD[metric], used, limit }
    })
    return { configured: this.configured, plan: eff.plan, unlimited: eff.unlimited, metrics }
  }

  /**
   * Usage-limit helper. Throws 429 when the user would exceed their plan limit,
   * otherwise records `amount` units. Owners are unlimited (still recorded).
   * For 'agents' (absolute) pass the delta (+1 create / -1 delete) or call setUsage.
   */
  async assertWithinLimit(userId: string, metric: UsageMetric, amount = 1) {
    const eff = await this.effective(userId)
    const key = periodKey(metric)
    const rec = await this.store.get(userId)
    const used = rec.usage[key]?.[metric] ?? 0
    const limit = eff.limits[metric]
    if (!eff.unlimited && limit !== UNLIMITED && amount > 0 && used + amount > limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'PlanLimitExceeded',
          message: `Your ${PLANS[eff.plan].name} plan allows ${limit} ${metric} per ${METRIC_PERIOD[metric]}. Upgrade in Billing to continue.`,
          metric,
          limit,
          used,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    await this.store.update(userId, (r) => {
      const bucket = (r.usage[key] ??= {})
      bucket[metric] = Math.max(0, (bucket[metric] ?? 0) + amount)
    })
  }

  async setUsage(userId: string, metric: UsageMetric, value: number) {
    const key = periodKey(metric)
    await this.store.update(userId, (r) => {
      ;(r.usage[key] ??= {})[metric] = Math.max(0, value)
    })
  }

  private async ensureCustomer(userId: string) {
    const rec = await this.store.get(userId)
    if (rec.stripeCustomerId) return rec.stripeCustomerId
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!user) throw new NotFoundException('User not found.')
    const customer = await this.stripe.request<{ id: string }>('POST', '/customers', {
      email: user.email,
      metadata: { userId },
    })
    await this.store.update(userId, (r) => {
      r.stripeCustomerId = customer.id
    })
    await this.store.linkCustomer(customer.id, userId)
    return customer.id
  }

  async createCheckout(userId: string, plan: PlanId) {
    const price = this.priceFor(plan)
    if (!this.configured) throw new BadRequestException('Billing is not configured.')
    if (!price) throw new BadRequestException(`Plan "${plan}" is not purchasable.`)
    const customer = await this.ensureCustomer(userId)
    const base = webBaseUrl()
    const session = await this.stripe.request<{ id: string; url: string }>('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: userId,
      line_items: { 0: { price, quantity: 1 } },
      metadata: { userId, plan, kind: 'subscription' },
      subscription_data: { metadata: { userId, plan } },
      success_url: `${base}/billing?checkout=success`,
      cancel_url: `${base}/billing?checkout=cancelled`,
    })
    return { url: session.url, id: session.id }
  }

  async createPortal(userId: string) {
    if (!this.configured) throw new BadRequestException('Billing is not configured.')
    const customer = await this.ensureCustomer(userId)
    const session = await this.stripe.request<{ url: string }>('POST', '/billing_portal/sessions', {
      customer,
      return_url: `${webBaseUrl()}/billing`,
    })
    return { url: session.url }
  }

  /** One-time Stripe Checkout for a paid marketplace item. */
  async createMarketplaceCheckout(userId: string, kind: MarketplaceItemKind, itemId: string) {
    if (!this.configured) throw new BadRequestException('Billing is not configured.')
    const price = await this.marketplace.getPrice(kind, itemId)
    if (!price) throw new BadRequestException('This item is free.')
    if (price.sellerId === userId) throw new BadRequestException('You already own this item.')
    if (await this.marketplace.hasPurchased(userId, kind, itemId)) {
      throw new BadRequestException('Already purchased.')
    }
    const customer = await this.ensureCustomer(userId)
    const base = webBaseUrl()
    const session = await this.stripe.request<{ id: string; url: string }>('POST', '/checkout/sessions', {
      mode: 'payment',
      customer,
      client_reference_id: userId,
      line_items: {
        0: {
          quantity: 1,
          price_data: {
            currency: price.currency,
            unit_amount: price.amountCents,
            product_data: { name: price.title || `OpenAgents ${kind} ${itemId}` },
          },
        },
      },
      metadata: { kind: 'marketplace', itemKind: kind, itemId, buyerId: userId, sellerId: price.sellerId },
      success_url: `${base}/agent/marketplace?purchase=success`,
      cancel_url: `${base}/agent/marketplace?purchase=cancelled`,
    })
    return { url: session.url, id: session.id }
  }

  async handleWebhook(rawBody: Buffer | string | undefined, signature: string | undefined) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
    if (!secret) throw new BadRequestException('Webhook secret not configured.')
    if (!rawBody) throw new BadRequestException('Raw body unavailable; enable rawBody in main.ts.')
    let event: any
    try {
      event = this.stripe.verifyWebhook(rawBody, signature, secret)
    } catch (error: any) {
      throw new BadRequestException(error?.message ?? 'Invalid signature')
    }

    const obj = event?.data?.object ?? {}
    switch (event?.type) {
      case 'checkout.session.completed': {
        const meta = obj.metadata ?? {}
        if (meta.kind === 'marketplace' && obj.payment_status === 'paid') {
          await this.marketplace.recordPurchase({
            kind: meta.itemKind,
            itemId: meta.itemId,
            buyerId: meta.buyerId,
            sellerId: meta.sellerId,
            amountCents: Number(obj.amount_total) || 0,
            currency: obj.currency ?? 'usd',
            stripeSessionId: obj.id,
          })
        } else if (meta.kind === 'subscription' && meta.userId) {
          await this.store.update(meta.userId, (r) => {
            r.plan = (meta.plan as PlanId) in PLANS ? (meta.plan as PlanId) : r.plan
            r.stripeSubscriptionId = obj.subscription ?? r.stripeSubscriptionId
            r.subscriptionStatus = 'active'
            if (obj.customer) r.stripeCustomerId = obj.customer
          })
          if (obj.customer) await this.store.linkCustomer(obj.customer, meta.userId)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const userId = obj.metadata?.userId || (obj.customer ? await this.store.userForCustomer(obj.customer) : undefined)
        if (!userId) break
        const priceId: string | undefined = obj.items?.data?.[0]?.price?.id
        const plan: PlanId | undefined =
          priceId && priceId === this.priceFor('team') ? 'team' : priceId && priceId === this.priceFor('pro') ? 'pro' : undefined
        await this.store.update(userId, (r) => {
          r.stripeSubscriptionId = obj.id
          r.subscriptionStatus = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status
          if (event.type === 'customer.subscription.deleted') r.plan = 'free'
          else if (plan) r.plan = plan
          if (obj.current_period_end) r.currentPeriodEnd = new Date(obj.current_period_end * 1000).toISOString()
        })
        break
      }
      default:
        break
    }
    return { received: true }
  }
}
