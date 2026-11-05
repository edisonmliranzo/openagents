import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { DocumentStore } from '../prisma/document-store.service'
import { ContactsService } from './contacts.service'

export type OutreachChannel = 'comment' | 'reply' | 'dm' | 'email' | 'sms' | 'whatsapp'
export const OUTREACH_CHANNELS: OutreachChannel[] = ['comment', 'reply', 'dm', 'email', 'sms', 'whatsapp']
export type OutreachStatus = 'sent' | 'replied' | 'booked' | 'converted'
export const OUTREACH_STATUSES: OutreachStatus[] = ['sent', 'replied', 'booked', 'converted']

export interface OutreachItem {
  id: string
  channel: OutreachChannel
  /** Hook / template name; variants of the same hook are compared for A/B. */
  hook: string
  variant: string
  variantText?: string
  recipient?: string
  contactId?: string
  status: OutreachStatus
  revenue: number
  sentAt: string
  repliedAt?: string
  bookedAt?: string
  convertedAt?: string
  note?: string
}

export interface Promotion {
  hook: string
  variant: string
  variantText?: string
  metric: string
  promotedAt: string
}

export interface RateRow {
  key: string
  sent: number
  replied: number
  booked: number
  converted: number
  revenue: number
  replyRate: number
  conversionRate: number
  revenuePerSent: number
}

const KIND = 'outreach'
const MAX_ITEMS = 5000
const RANK: Record<OutreachStatus, number> = { sent: 0, replied: 1, booked: 2, converted: 3 }

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d

function erf(x: number) {
  const s = Math.sign(x)
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return s * y
}
const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))

/** Two-proportion z-test (two-sided). */
export function twoProportionTest(x1: number, n1: number, x2: number, n2: number) {
  if (!n1 || !n2) return { z: 0, pValue: 1 }
  const p1 = x1 / n1
  const p2 = x2 / n2
  const pool = (x1 + x2) / (n1 + n2)
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2))
  if (!se) return { z: 0, pValue: 1 }
  const z = (p1 - p2) / se
  return { z, pValue: 2 * (1 - normCdf(Math.abs(z))) }
}

function rows(items: OutreachItem[], keyOf: (i: OutreachItem) => string): RateRow[] {
  const map = new Map<string, OutreachItem[]>()
  for (const i of items) map.set(keyOf(i), [...(map.get(keyOf(i)) ?? []), i])
  return [...map.entries()]
    .map(([key, list]) => {
      const sent = list.length
      const replied = list.filter((i) => RANK[i.status] >= 1).length
      const booked = list.filter((i) => RANK[i.status] >= 2).length
      const converted = list.filter((i) => i.status === 'converted').length
      const revenue = list.reduce((s, i) => s + (i.revenue || 0), 0)
      return {
        key, sent, replied, booked, converted, revenue: round(revenue, 2),
        replyRate: round(sent ? replied / sent : 0), conversionRate: round(sent ? converted / sent : 0),
        revenuePerSent: round(sent ? revenue / sent : 0, 2),
      }
    })
    .sort((a, b) => b.sent - a.sent)
}

@Injectable()
export class OutreachService {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly docs: DocumentStore, private readonly contacts: ContactsService) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => undefined)
    return next
  }

  private load(userId: string) {
    return this.docs.read<OutreachItem[]>(userId, KIND, () => [], 'items')
  }
  private loadPromotions(userId: string) {
    return this.docs.read<Promotion[]>(userId, KIND, () => [], 'promotions')
  }

  async list(userId: string, filter: { channel?: string; hook?: string; status?: string; contactId?: string } = {}, limit = 200) {
    const items = await this.load(userId)
    return items
      .filter((i) => !filter.channel || i.channel === filter.channel)
      .filter((i) => !filter.hook || i.hook === filter.hook)
      .filter((i) => !filter.status || i.status === filter.status)
      .filter((i) => !filter.contactId || i.contactId === filter.contactId)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, Math.min(Math.max(limit, 1), 1000))
  }

  async forContact(userId: string, contactId: string) {
    return this.list(userId, { contactId }, 1000)
  }

  /** Logs a sent outreach item; if a contact identifier is given it also lands on that contact's timeline. */
  async track(
    userId: string,
    input: { channel: OutreachChannel; hook: string; variant?: string; variantText?: string; recipient?: string; contactId?: string; contactName?: string; note?: string; sentAt?: string },
  ) {
    let contactId = input.contactId
    if (!contactId && input.recipient) {
      const r = input.recipient.trim()
      const identity = r.includes('@') && r.includes('.') && !r.startsWith('@') ? { email: r } : /^\+?[\d\s().-]{7,}$/.test(r) ? { phone: r } : { handle: r, platform: input.channel }
      contactId = (await this.contacts.findOrCreate(userId, identity, input.contactName)).id
    }
    const item: OutreachItem = {
      id: randomUUID(), channel: input.channel, hook: input.hook.trim().slice(0, 120), variant: (input.variant ?? 'A').trim().slice(0, 40) || 'A',
      variantText: input.variantText?.slice(0, 4000), recipient: input.recipient?.slice(0, 200), contactId, status: 'sent', revenue: 0,
      sentAt: input.sentAt && !Number.isNaN(Date.parse(input.sentAt)) ? new Date(input.sentAt).toISOString() : new Date().toISOString(),
      note: input.note?.slice(0, 1000),
    }
    await this.serialize(async () => {
      const items = await this.load(userId)
      items.push(item)
      if (items.length > MAX_ITEMS) items.splice(0, items.length - MAX_ITEMS)
      await this.docs.write(userId, KIND, items, 'items')
    })
    if (contactId) {
      await this.contacts
        .addInteraction(userId, contactId, { channel: item.channel, direction: 'outbound', text: item.variantText || `Outreach "${item.hook}" (variant ${item.variant})`, at: item.sentAt, meta: { outreachId: item.id, hook: item.hook, variant: item.variant } })
        .catch(() => undefined)
    }
    return item
  }

  /** Moves an item forward through sent -> replied -> booked -> converted (statuses never regress). */
  async advance(userId: string, id: string, status: OutreachStatus, revenue?: number, note?: string) {
    if (!OUTREACH_STATUSES.includes(status)) throw new BadRequestException('Invalid status')
    const updated = await this.serialize(async () => {
      const items = await this.load(userId)
      const item = items.find((i) => i.id === id)
      if (!item) throw new NotFoundException('Outreach item not found')
      const now = new Date().toISOString()
      if (RANK[status] > RANK[item.status]) item.status = status
      if (RANK[status] >= 1 && !item.repliedAt) item.repliedAt = now
      if (RANK[status] >= 2 && !item.bookedAt) item.bookedAt = now
      if (status === 'converted' && !item.convertedAt) item.convertedAt = now
      if (revenue !== undefined) item.revenue = Math.max(0, revenue)
      if (note) item.note = note.slice(0, 1000)
      await this.docs.write(userId, KIND, items, 'items')
      return item
    })
    if (updated.contactId && RANK[status] >= 1) {
      await this.contacts
        .addInteraction(userId, updated.contactId, { channel: updated.channel, direction: status === 'replied' ? 'inbound' : 'note', text: `Outreach "${updated.hook}" → ${status}${revenue ? ` (revenue ${revenue})` : ''}`, meta: { outreachId: id } })
        .catch(() => undefined)
    }
    return updated
  }

  async remove(userId: string, id: string) {
    return this.serialize(async () => {
      const items = await this.load(userId)
      if (!items.some((i) => i.id === id)) throw new NotFoundException('Outreach item not found')
      await this.docs.write(userId, KIND, items.filter((i) => i.id !== id), 'items')
      return { ok: true }
    })
  }

  async analytics(userId: string, days?: number) {
    let items = await this.load(userId)
    if (days && days > 0) {
      const cutoff = Date.now() - days * 86_400_000
      items = items.filter((i) => Date.parse(i.sentAt) >= cutoff)
    }
    const totals = rows(items, () => 'all')[0] ?? { key: 'all', sent: 0, replied: 0, booked: 0, converted: 0, revenue: 0, replyRate: 0, conversionRate: 0, revenuePerSent: 0 }
    const experiments = await this.experiments(userId, 'conversion', items)
    return {
      totals,
      byChannel: rows(items, (i) => i.channel),
      byHook: rows(items, (i) => i.hook),
      byVariant: rows(items, (i) => `${i.hook}::${i.variant}`).map((r) => ({ ...r, hook: r.key.split('::')[0], variant: r.key.split('::')[1] })),
      experiments,
      promotions: await this.loadPromotions(userId),
    }
  }

  /** A/B report for every hook with >= 2 variants. Winner by reply rate or conversion rate with a z-test. */
  async experiments(userId: string, metric: 'reply' | 'conversion' = 'conversion', preloaded?: OutreachItem[]) {
    const items = preloaded ?? (await this.load(userId))
    const promotions = await this.loadPromotions(userId)
    const hooks = new Map<string, OutreachItem[]>()
    for (const i of items) hooks.set(i.hook, [...(hooks.get(i.hook) ?? []), i])
    const out: any[] = []
    for (const [hook, list] of hooks) {
      const variantRows = rows(list, (i) => i.variant)
      if (variantRows.length < 2) continue
      const succ = (r: RateRow) => (metric === 'reply' ? r.replied : r.converted)
      const ranked = [...variantRows].sort((a, b) => succ(b) / (b.sent || 1) - succ(a) / (a.sent || 1) || b.revenue - a.revenue)
      const [best, second] = ranked
      const test = twoProportionTest(succ(best), best.sent, succ(second), second.sent)
      const enough = best.sent >= 10 && second.sent >= 10
      const significant = enough && test.pValue < 0.05 && succ(best) / best.sent > succ(second) / second.sent
      const texts = new Map<string, string | undefined>()
      for (const i of list) if (i.variantText) texts.set(i.variant, i.variantText)
      const promoted = promotions.find((p) => p.hook === hook)
      out.push({
        hook,
        metric,
        variants: variantRows.map((r) => ({ ...r, variant: r.key, text: texts.get(r.key) })),
        winner: significant ? best.key : null,
        leader: best.key,
        significant,
        pValue: round(test.pValue),
        zScore: round(test.z, 3),
        confidence: round(1 - test.pValue, 3),
        verdict: !enough
          ? `Need at least 10 sends per variant (have ${best.sent} / ${second.sent}).`
          : significant
            ? `Variant ${best.key} wins on ${metric} rate (p=${round(test.pValue, 4)}).`
            : `No significant difference yet (p=${round(test.pValue, 3)}); keep testing.`,
        promoted: promoted ?? null,
      })
    }
    return out
  }

  /** Records the winning variant of a hook as the one the agent should use going forward. */
  async promote(userId: string, hook: string, variant?: string, metric: 'reply' | 'conversion' = 'conversion') {
    const exps = await this.experiments(userId, metric)
    const exp = exps.find((e) => e.hook === hook)
    if (!exp) throw new NotFoundException('No A/B experiment found for that hook (need 2+ variants)')
    const chosen = variant ?? exp.winner
    if (!chosen) throw new BadRequestException('No statistically significant winner yet; pass an explicit variant to override')
    const v = exp.variants.find((x: any) => x.variant === chosen)
    if (!v) throw new BadRequestException('Unknown variant for that hook')
    const promotion: Promotion = { hook, variant: chosen, variantText: v.text, metric, promotedAt: new Date().toISOString() }
    await this.serialize(async () => {
      const all = (await this.loadPromotions(userId)).filter((p) => p.hook !== hook)
      all.push(promotion)
      await this.docs.write(userId, KIND, all, 'promotions')
    })
    return promotion
  }

  promotions(userId: string) {
    return this.loadPromotions(userId)
  }
}
