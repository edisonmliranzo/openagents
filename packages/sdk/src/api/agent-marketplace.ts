import type { OpenAgentsClient } from '../client'

export interface AgentPermissionManifest {
  tools: string[]
  networkDomains: string[]
  dataScopes: string[]
}

export interface AgentListingRow {
  id: string
  creatorId: string
  kind: 'agent' | 'workflow'
  title: string
  description: string
  version: string
  priceCents: number
  currency: string
  manifest: AgentPermissionManifest
  manifestHash: string
  definition?: { systemPrompt?: string; steps?: string[] }
  status: 'published' | 'unlisted'
  installCount: number
  free: boolean
  creatorSharePct: number
  createdAt: string
  updatedAt: string
  installed?: boolean
  mine?: boolean
  purchased?: boolean
}

export interface AgentInstallRow {
  listingId: string
  creatorId: string
  version: string
  manifestHash: string
  granted: AgentPermissionManifest
  purchaseId?: string
  paymentReference?: string
  installedAt: string
  listing: AgentListingRow | null
  needsReconsent: boolean
}

export interface AgentMarketplaceInfo {
  provider: { name: string; simulated: boolean }
  platformFeePct: number
  creatorSharePct: number
  minPaidPriceCents: number
  minPayoutCents: number
  dataScopes: string[]
}

export interface AgentMarketplaceEarnings {
  provider: { name: string; simulated: boolean }
  platformFeePct: number
  creatorSharePct: number
  totals: { grossCents: number; platformFeeCents: number; netCents: number; paidOutCents: number; payoutBalanceCents: number }
  minPayoutCents: number
  byListing: Array<{ itemId: string; title: string; sales: number; grossCents: number; netCents: number }>
  entries: Array<{ id: string; purchaseId: string; itemId: string; grossCents: number; platformFeeCents: number; netCents: number; currency: string; status: string; createdAt: string }>
  payouts: Array<{ id: string; amountCents: number; currency: string; reference: string; provider: string; createdAt: string }>
}

export interface PublishAgentListingInput {
  kind?: 'agent' | 'workflow'
  title: string
  description: string
  version?: string
  priceCents?: number
  currency?: string
  manifest?: Partial<AgentPermissionManifest>
  definition?: { systemPrompt?: string; steps?: string[] }
}

export interface InstallAgentListingInput {
  manifestHash: string
  grant?: Partial<AgentPermissionManifest>
  paymentMethod?: 'test_card' | 'test_decline'
}

const BASE = '/api/v1/agent-marketplace'

export function createAgentMarketplaceApi(client: OpenAgentsClient) {
  return {
    info: () => client.get<AgentMarketplaceInfo>(`${BASE}/info`),
    browse: (q?: string) => client.get<AgentListingRow[]>(`${BASE}/listings${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    mine: () => client.get<AgentListingRow[]>(`${BASE}/listings/mine`),
    get: (id: string) => client.get<AgentListingRow>(`${BASE}/listings/${encodeURIComponent(id)}`),
    publish: (input: PublishAgentListingInput) => client.post<AgentListingRow>(`${BASE}/listings`, input),
    update: (id: string, input: Partial<PublishAgentListingInput> & { status?: 'published' | 'unlisted' }) =>
      client.patch<AgentListingRow>(`${BASE}/listings/${encodeURIComponent(id)}`, input),
    install: (id: string, input: InstallAgentListingInput) =>
      client.post<{ install: unknown; listing: AgentListingRow }>(`${BASE}/listings/${encodeURIComponent(id)}/install`, input),
    uninstall: (id: string) => client.delete<{ removed: boolean }>(`${BASE}/installs/${encodeURIComponent(id)}`),
    installs: () => client.get<AgentInstallRow[]>(`${BASE}/installs`),
    authorize: (id: string, req: { tool?: string; scope?: string; url?: string }) =>
      client.post<{ allowed: boolean; reason?: string }>(`${BASE}/installs/${encodeURIComponent(id)}/authorize`, req),
    earnings: () => client.get<AgentMarketplaceEarnings>(`${BASE}/earnings`),
    requestPayout: () => client.post<{ payout: unknown; simulated: boolean }>(`${BASE}/payouts`),
  }
}
