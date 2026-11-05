import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import { DocumentStore } from '../prisma/document-store.service'
import { MarketplaceService } from '../billing/marketplace.service'
import { platformFeePct } from '../billing/marketplace.store'
import { KeyedLock } from '../common/keyed-lock'
import { assertPublicHttpUrl } from '../frontier/safe-fetch'
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider'

import {
  DATA_SCOPES,
  domainAllowed,
  extractUrlsFromInput,
  inferToolDataScope,
  isSubset,
  manifestHash,
  type PermissionManifest,
  validateAndNormalizeManifest,
} from './marketplace-permissions'
export {
  DATA_SCOPES,
  domainAllowed,
  extractUrlsFromInput,
  inferToolDataScope,
  isSubset,
  manifestHash,
  type PermissionManifest,
}

const LISTING_KIND = 'am-listing'
const INSTALL_KIND = 'am-install'
const PAYOUT_KIND = 'am-payout'
const MIN_PAID_CENTS = 50
const MAX_PRICE_CENTS = 100_000_00
const MIN_PAYOUT_CENTS = 500
const MAX_LISTINGS_SCAN = 500

export function normalizeManifest(input: Partial<PermissionManifest> | undefined): PermissionManifest {
  try {
    return validateAndNormalizeManifest(input)
  } catch (e: any) {
    throw new BadRequestException(e?.message ?? 'Invalid permission manifest.')
  }
}

export interface AgentListing {
  id: string
  creatorId: string
  kind: 'agent' | 'workflow'
  title: string
  description: string
  version: string
  priceCents: number
  currency: string
  manifest: PermissionManifest
  definition?: { systemPrompt?: string; steps?: string[] }
  status: 'published' | 'unlisted'
  installCount: number
  createdAt: string
  updatedAt: string
}

export interface AgentInstall {
  listingId: string
  creatorId: string
  version: string
  manifestHash: string
  granted: PermissionManifest
  purchaseId?: string
  paymentReference?: string
  installedAt: string
}

interface PayoutDoc {
  payouts: Array<{ id: string; amountCents: number; currency: string; reference: string; provider: string; createdAt: string }>
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

@Injectable()
export class AgentMarketplaceService {
  private readonly lock = new KeyedLock()

  constructor(
    private readonly docs: DocumentStore,
    private readonly marketplace: MarketplaceService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  info() {
    const fee = platformFeePct()
    return {
      provider: { name: this.payments.name, simulated: this.payments.simulated },
      platformFeePct: fee,
      creatorSharePct: 100 - fee,
      minPaidPriceCents: MIN_PAID_CENTS,
      minPayoutCents: MIN_PAYOUT_CENTS,
      dataScopes: DATA_SCOPES,
    }
  }

  // ── Listings ──────────────────────────────────────────────────────────────

  async publish(userId: string, input: {
    kind?: 'agent' | 'workflow'
    title: string
    description: string
    version?: string
    priceCents?: number
    currency?: string
    manifest?: Partial<PermissionManifest>
    definition?: { systemPrompt?: string; steps?: string[] }
  }) {
    const priceCents = this.validatePrice(input.priceCents ?? 0)
    const now = new Date().toISOString()
    const listing: AgentListing = {
      id: `${userId}.${randomUUID()}`,
      creatorId: userId,
      kind: input.kind === 'workflow' ? 'workflow' : 'agent',
      title: input.title.trim(),
      description: input.description.trim(),
      version: (input.version ?? '1.0.0').trim(),
      priceCents,
      currency: (input.currency ?? 'usd').toLowerCase().slice(0, 3),
      manifest: normalizeManifest(input.manifest),
      definition: input.definition,
      status: 'published',
      installCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    await this.docs.write(userId, LISTING_KIND, listing, listing.id)
    return this.view(listing)
  }

  async update(userId: string, id: string, patch: {
    title?: string
    description?: string
    version?: string
    priceCents?: number
    manifest?: Partial<PermissionManifest>
    definition?: { systemPrompt?: string; steps?: string[] }
    status?: 'published' | 'unlisted'
  }) {
    const listing = await this.requireOwned(userId, id)
    if (patch.title !== undefined) listing.title = patch.title.trim()
    if (patch.description !== undefined) listing.description = patch.description.trim()
    if (patch.version !== undefined) listing.version = patch.version.trim()
    if (patch.priceCents !== undefined) listing.priceCents = this.validatePrice(patch.priceCents)
    if (patch.manifest !== undefined) listing.manifest = normalizeManifest(patch.manifest)
    if (patch.definition !== undefined) listing.definition = patch.definition
    if (patch.status !== undefined) listing.status = patch.status
    listing.updatedAt = new Date().toISOString()
    await this.docs.write(userId, LISTING_KIND, listing, id)
    return this.view(listing)
  }

  async browse(userId: string, q?: string) {
    const all = await this.allListings()
    const needle = (q ?? '').trim().toLowerCase()
    const rows = all.filter((l) => l.status === 'published' && (!needle || `${l.title} ${l.description}`.toLowerCase().includes(needle)))
    const installs = new Set(await this.docs.listKeys(userId, INSTALL_KIND))
    return rows
      .sort((a, b) => b.installCount - a.installCount || b.updatedAt.localeCompare(a.updatedAt))
      .map((l) => ({ ...this.view(l), installed: installs.has(l.id), mine: l.creatorId === userId }))
  }

  async mine(userId: string) {
    const keys = await this.docs.listKeys(userId, LISTING_KIND)
    const out: unknown[] = []
    for (const key of keys) {
      const l = await this.docs.read<AgentListing | null>(userId, LISTING_KIND, () => null, key)
      if (l) out.push(this.view(l))
    }
    return out
  }

  async get(userId: string, id: string) {
    const listing = await this.requireListing(id)
    if (listing.status !== 'published' && listing.creatorId !== userId) throw new NotFoundException('Listing not found.')
    const install = await this.docs.read<AgentInstall | null>(userId, INSTALL_KIND, () => null, id)
    const purchased = listing.priceCents === 0 || listing.creatorId === userId || (await this.marketplace.hasPurchased(userId, 'agent', id))
    return { ...this.view(listing), installed: !!install, purchased, mine: listing.creatorId === userId }
  }

  // ── Install with consent ──────────────────────────────────────────────────

  async install(userId: string, id: string, input: { manifestHash: string; grant?: Partial<PermissionManifest>; paymentMethod?: string }) {
    return this.lock.run(`${userId}:${id}`, async () => {
      const listing = await this.requireListing(id)
      if (listing.status !== 'published' && listing.creatorId !== userId) throw new NotFoundException('Listing not found.')
      const current = manifestHash(listing.version, listing.manifest)
      if (!input.manifestHash || !safeEqualHex(input.manifestHash, current)) {
        throw new HttpException(
          { statusCode: HttpStatus.CONFLICT, error: 'ManifestChanged', message: 'The permission manifest changed or was not acknowledged. Review and consent again.', manifestHash: current },
          HttpStatus.CONFLICT,
        )
      }
      const granted = input.grant ? normalizeManifest(input.grant) : listing.manifest
      if (!isSubset(granted.tools, listing.manifest.tools) || !isSubset(granted.networkDomains, listing.manifest.networkDomains) || !isSubset(granted.dataScopes, listing.manifest.dataScopes)) {
        throw new BadRequestException('Granted permissions must be a subset of the declared manifest.')
      }

      let purchaseId: string | undefined
      let paymentReference: string | undefined
      const isOwner = listing.creatorId === userId
      if (listing.priceCents > 0 && !isOwner && !(await this.marketplace.hasPurchased(userId, 'agent', id))) {
        const charge = await this.payments.charge({
          buyerId: userId,
          amountCents: listing.priceCents,
          currency: listing.currency,
          description: `OpenAgents listing ${listing.title}`.slice(0, 120),
          idempotencyKey: `agent:${id}:${userId}`,
          paymentMethod: input.paymentMethod,
        })
        if (!charge.ok) {
          throw new HttpException({ statusCode: HttpStatus.PAYMENT_REQUIRED, error: 'PaymentDeclined', message: charge.failureReason ?? 'Payment declined.' }, HttpStatus.PAYMENT_REQUIRED)
        }
        const purchase = await this.marketplace.recordPurchase({
          kind: 'agent',
          itemId: id,
          buyerId: userId,
          sellerId: listing.creatorId,
          amountCents: listing.priceCents,
          currency: listing.currency,
          stripeSessionId: `${this.payments.name}:${charge.reference}`,
        })
        purchaseId = purchase.id
        paymentReference = charge.reference
      }

      const existing = await this.docs.read<AgentInstall | null>(userId, INSTALL_KIND, () => null, id)
      const install: AgentInstall = {
        listingId: id,
        creatorId: listing.creatorId,
        version: listing.version,
        manifestHash: current,
        granted,
        purchaseId: purchaseId ?? existing?.purchaseId,
        paymentReference: paymentReference ?? existing?.paymentReference,
        installedAt: existing?.installedAt ?? new Date().toISOString(),
      }
      await this.docs.write(userId, INSTALL_KIND, install, id)
      if (!existing) await this.bumpInstallCount(listing)
      return { install, listing: this.view(listing) }
    })
  }

  async uninstall(userId: string, id: string) {
    await this.docs.remove(userId, INSTALL_KIND, id)
    return { removed: true }
  }

  async installs(userId: string) {
    const keys = await this.docs.listKeys(userId, INSTALL_KIND)
    const out: Array<AgentInstall & { listing: ReturnType<AgentMarketplaceService['view']> | null; needsReconsent: boolean }> = []
    for (const key of keys) {
      const install = await this.docs.read<AgentInstall | null>(userId, INSTALL_KIND, () => null, key)
      if (!install) continue
      const listing = await this.findListing(key)
      const needsReconsent = !listing || manifestHash(listing.version, listing.manifest) !== install.manifestHash
      out.push({ ...install, listing: listing ? this.view(listing) : null, needsReconsent })
    }
    return out
  }

  /** Runtime permission gate: is `tool` / `url` / `scope` allowed for this install? */
  async authorize(userId: string, id: string, req: { tool?: string; url?: string; scope?: string }) {
    const install = await this.docs.read<AgentInstall | null>(userId, INSTALL_KIND, () => null, id)
    if (!install) return { allowed: false, reason: 'not_installed' }
    const listing = await this.findListing(id)
    if (listing && manifestHash(listing.version, listing.manifest) !== install.manifestHash) {
      return { allowed: false, reason: 'reconsent_required' }
    }
    if (req.tool !== undefined) {
      return install.granted.tools.includes(req.tool) ? { allowed: true } : { allowed: false, reason: `tool_not_granted:${req.tool.slice(0, 64)}` }
    }
    if (req.scope !== undefined) {
      return install.granted.dataScopes.includes(req.scope) ? { allowed: true } : { allowed: false, reason: `scope_not_granted:${req.scope.slice(0, 64)}` }
    }
    if (req.url !== undefined) {
      let url: URL
      try {
        url = await assertPublicHttpUrl(req.url)
      } catch (e: any) {
        return { allowed: false, reason: `url_rejected:${String(e?.message ?? 'invalid').slice(0, 100)}` }
      }
      return domainAllowed(url.hostname, install.granted.networkDomains)
        ? { allowed: true }
        : { allowed: false, reason: `domain_not_granted:${url.hostname.slice(0, 100)}` }
    }
    throw new BadRequestException('Provide one of tool, scope or url.')
  }

  /** For other modules: throws 403 if the install does not permit the action. */
  async assertAllowed(userId: string, id: string, req: { tool?: string; url?: string; scope?: string }) {
    const res = await this.authorize(userId, id, req)
    if (!res.allowed) throw new ForbiddenException(`Agent permission denied (${res.reason}).`)
  }

  // ── Creator earnings & payouts ────────────────────────────────────────────

  async earnings(userId: string) {
    const ledger = await this.marketplace.earnings(userId)
    const entries = ledger.entries.filter((e) => e.kind === 'agent')
    const sum = (k: 'grossCents' | 'platformFeeCents' | 'netCents') => entries.reduce((a, e) => a + e[k], 0)
    const doc = await this.docs.read<PayoutDoc>(userId, PAYOUT_KIND, () => ({ payouts: [] }))
    const paidOutCents = doc.payouts.reduce((a, p) => a + p.amountCents, 0)
    const netCents = sum('netCents')
    const byListing = new Map<string, { itemId: string; sales: number; grossCents: number; netCents: number }>()
    for (const e of entries) {
      const row = byListing.get(e.itemId) ?? { itemId: e.itemId, sales: 0, grossCents: 0, netCents: 0 }
      row.sales += 1
      row.grossCents += e.grossCents
      row.netCents += e.netCents
      byListing.set(e.itemId, row)
    }
    const titles = new Map((await this.mine(userId) as AgentListing[]).map((l) => [l.id, l.title]))
    return {
      provider: { name: this.payments.name, simulated: this.payments.simulated },
      platformFeePct: ledger.platformFeePct,
      creatorSharePct: 100 - ledger.platformFeePct,
      totals: {
        grossCents: sum('grossCents'),
        platformFeeCents: sum('platformFeeCents'),
        netCents,
        paidOutCents,
        payoutBalanceCents: Math.max(0, netCents - paidOutCents),
      },
      minPayoutCents: MIN_PAYOUT_CENTS,
      byListing: [...byListing.values()].map((r) => ({ ...r, title: titles.get(r.itemId) ?? r.itemId })),
      entries,
      payouts: doc.payouts,
    }
  }

  async requestPayout(userId: string) {
    return this.lock.run(`payout:${userId}`, async () => {
      const e = await this.earnings(userId)
      const amount = e.totals.payoutBalanceCents
      if (amount < MIN_PAYOUT_CENTS) throw new BadRequestException(`Minimum payout is ${MIN_PAYOUT_CENTS} cents; balance is ${amount}.`)
      const doc = await this.docs.read<PayoutDoc>(userId, PAYOUT_KIND, () => ({ payouts: [] }))
      const id = randomUUID()
      const result = await this.payments.payout({ creatorId: userId, amountCents: amount, currency: 'usd', idempotencyKey: `payout:${userId}:${id}` })
      if (!result.ok) throw new HttpException('Payout failed.', HttpStatus.BAD_GATEWAY)
      doc.payouts.unshift({ id, amountCents: amount, currency: 'usd', reference: result.reference, provider: this.payments.name, createdAt: new Date().toISOString() })
      await this.docs.write(userId, PAYOUT_KIND, doc)
      return { payout: doc.payouts[0], simulated: this.payments.simulated }
    })
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private view(l: AgentListing) {
    return { ...l, manifestHash: manifestHash(l.version, l.manifest), free: l.priceCents === 0, creatorSharePct: 100 - platformFeePct() }
  }

  private validatePrice(cents: number) {
    const n = Math.round(Number(cents))
    if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE_CENTS) throw new BadRequestException('Invalid price.')
    if (n > 0 && n < MIN_PAID_CENTS) throw new BadRequestException(`Minimum paid price is ${MIN_PAID_CENTS} cents.`)
    return n
  }

  private parseOwner(id: string): string | null {
    const dot = id.indexOf('.')
    return dot > 0 && id.length < 200 ? id.slice(0, dot) : null
  }

  private async findListing(id: string): Promise<AgentListing | null> {
    const owner = this.parseOwner(id)
    if (!owner) return null
    return this.docs.read<AgentListing | null>(owner, LISTING_KIND, () => null, id)
  }

  private async requireListing(id: string) {
    const l = await this.findListing(id)
    if (!l) throw new NotFoundException('Listing not found.')
    return l
  }

  private async requireOwned(userId: string, id: string) {
    const l = await this.requireListing(id)
    if (l.creatorId !== userId) throw new ForbiddenException('Only the creator can modify this listing.')
    return l
  }

  private async allListings(): Promise<AgentListing[]> {
    const creators = await this.docs.listUserIds(LISTING_KIND)
    const out: AgentListing[] = []
    for (const creator of creators) {
      for (const key of await this.docs.listKeys(creator, LISTING_KIND)) {
        const l = await this.docs.read<AgentListing | null>(creator, LISTING_KIND, () => null, key)
        if (l) out.push(l)
        if (out.length >= MAX_LISTINGS_SCAN) return out
      }
    }
    return out
  }

  private async bumpInstallCount(listing: AgentListing) {
    await this.lock.run(`listing:${listing.id}`, async () => {
      const fresh = await this.findListing(listing.id)
      if (!fresh) return
      fresh.installCount += 1
      await this.docs.write(fresh.creatorId, LISTING_KIND, fresh, fresh.id)
    })
  }
}
