import type { OpenAgentsClient } from '../client'

export type BillingPlanId = 'free' | 'pro' | 'team'
export type BillingUsageMetric = 'messages' | 'researchJobs' | 'agents' | 'voiceMinutes'
export type MarketplaceItemKind = 'skill' | 'pack'

export interface BillingPlanLimits {
  messages: number
  researchJobs: number
  agents: number
  voiceMinutes: number
}

export interface BillingPlanDefinition {
  id: BillingPlanId
  name: string
  priceLabel: string
  limits: BillingPlanLimits
  features: string[]
  purchasable: boolean
}

export interface BillingPlanState {
  configured: boolean
  plan: BillingPlanId
  unlimited: boolean
  limits: BillingPlanLimits
  subscriptionStatus: string | null
  currentPeriodEnd: string | null
  hasCustomer: boolean
  plans: BillingPlanDefinition[]
}

export interface BillingUsage {
  configured: boolean
  plan: BillingPlanId
  unlimited: boolean
  /** limit = -1 means unlimited */
  metrics: Array<{ metric: BillingUsageMetric; period: 'day' | 'month' | 'absolute'; used: number; limit: number }>
}

export interface MarketplacePrice {
  kind: MarketplaceItemKind
  itemId: string
  sellerId: string
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
  createdAt: string
}

export interface MarketplaceAccess {
  price: MarketplacePrice | null
  purchased: boolean
  canInstall: boolean
}

export interface MarketplaceEarnings {
  platformFeePct: number
  totals: { grossCents: number; platformFeeCents: number; netCents: number; pendingPayoutCents: number }
  entries: Array<{
    id: string
    purchaseId: string
    kind: MarketplaceItemKind
    itemId: string
    grossCents: number
    platformFeeCents: number
    netCents: number
    currency: string
    status: 'pending_payout' | 'paid'
    createdAt: string
  }>
}

export function createBillingApi(client: OpenAgentsClient) {
  return {
    plan: () => client.get<BillingPlanState>('/api/v1/billing/plan'),
    usage: () => client.get<BillingUsage>('/api/v1/billing/usage'),
    checkout: (plan: Exclude<BillingPlanId, 'free'>) =>
      client.post<{ url: string; id: string }>('/api/v1/billing/checkout', { plan }),
    portal: () => client.post<{ url: string }>('/api/v1/billing/portal'),
  }
}

export function createMarketplaceApi(client: OpenAgentsClient) {
  return {
    prices: () => client.get<MarketplacePrice[]>('/api/v1/marketplace/prices'),
    purchases: () => client.get<MarketplacePurchase[]>('/api/v1/marketplace/purchases'),
    checkout: (kind: MarketplaceItemKind, itemId: string) =>
      client.post<{ url: string; id: string }>('/api/v1/marketplace/checkout', { kind, itemId }),
    earnings: () => client.get<MarketplaceEarnings>('/api/v1/marketplace/earnings'),
    /** Not implemented server-side (returns 501). */
    requestPayout: () => client.post<never>('/api/v1/marketplace/payouts'),
  }
}
