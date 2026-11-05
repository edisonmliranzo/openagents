import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { DocumentStore } from '../prisma/document-store.service'

export type ContactStage = 'lead' | 'contacted' | 'engaged' | 'meeting' | 'customer' | 'lost'
export const CONTACT_STAGES: ContactStage[] = ['lead', 'contacted', 'engaged', 'meeting', 'customer', 'lost']
export type InteractionDirection = 'inbound' | 'outbound' | 'note'

export interface ContactRecord {
  id: string
  name: string
  emails: string[]
  phones: string[]
  handles: { platform: string; handle: string }[]
  tags: string[]
  notes: string
  stage: ContactStage
  createdAt: string
  updatedAt: string
  lastInteractionAt?: string
  mergedFrom?: string[]
}

export interface InteractionRecord {
  id: string
  contactId: string
  channel: string
  direction: InteractionDirection
  text: string
  at: string
  meta?: Record<string, unknown>
}

export interface ContactIdentity {
  email?: string
  phone?: string
  handle?: string
  platform?: string
}

const KIND = 'contacts'
const MAX_INTERACTIONS = 5000
const MAX_CONTACTS = 5000

export const normEmail = (v?: string) => String(v ?? '').trim().toLowerCase()
export const normPhone = (v?: string) => {
  const s = String(v ?? '').trim()
  const digits = s.replace(/[^\d]/g, '')
  return digits ? (s.startsWith('+') ? '+' : '') + digits : ''
}
export const normHandle = (v?: string) => String(v ?? '').trim().replace(/^@/, '').toLowerCase()

/** Unified contact memory (CRM-lite): one record per person merged across channels. */
@Injectable()
export class ContactsService {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly docs: DocumentStore) {}

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => undefined)
    return next
  }

  private loadContacts(userId: string) {
    return this.docs.read<ContactRecord[]>(userId, KIND, () => [], 'contacts')
  }
  private loadInteractions(userId: string) {
    return this.docs.read<InteractionRecord[]>(userId, KIND, () => [], 'interactions')
  }

  private matches(c: ContactRecord, id: ContactIdentity): boolean {
    const e = normEmail(id.email)
    const p = normPhone(id.phone)
    const h = normHandle(id.handle)
    const pf = String(id.platform ?? '').trim().toLowerCase()
    if (e && c.emails.includes(e)) return true
    if (p && c.phones.includes(p)) return true
    if (h && c.handles.some((x) => x.handle === h && (!pf || !x.platform || x.platform === pf))) return true
    return false
  }

  private applyIdentity(c: ContactRecord, id: ContactIdentity) {
    const e = normEmail(id.email)
    const p = normPhone(id.phone)
    const h = normHandle(id.handle)
    const pf = String(id.platform ?? '').trim().toLowerCase()
    if (e && !c.emails.includes(e)) c.emails.push(e)
    if (p && !c.phones.includes(p)) c.phones.push(p)
    if (h && !c.handles.some((x) => x.handle === h && x.platform === pf)) c.handles.push({ platform: pf, handle: h })
  }

  async list(userId: string, q?: string, tag?: string, stage?: string) {
    const contacts = await this.loadContacts(userId)
    const needle = String(q ?? '').trim().toLowerCase()
    return contacts
      .filter((c) => !stage || c.stage === stage)
      .filter((c) => !tag || c.tags.includes(tag.toLowerCase()))
      .filter(
        (c) =>
          !needle ||
          [c.name, c.notes, ...c.emails, ...c.phones, ...c.handles.map((h) => h.handle), ...c.tags].join(' ').toLowerCase().includes(needle),
      )
      .sort((a, b) => (b.lastInteractionAt ?? b.updatedAt).localeCompare(a.lastInteractionAt ?? a.updatedAt))
  }

  async get(userId: string, id: string) {
    const contacts = await this.loadContacts(userId)
    const contact = contacts.find((c) => c.id === id)
    if (!contact) throw new NotFoundException('Contact not found')
    const interactions = (await this.loadInteractions(userId))
      .filter((i) => i.contactId === id)
      .sort((a, b) => a.at.localeCompare(b.at))
    return { contact, timeline: interactions }
  }

  /** Finds a contact matching any identifier, or creates one. Merges new identifiers into the match. */
  findOrCreate(userId: string, identity: ContactIdentity, name?: string): Promise<ContactRecord> {
    return this.serialize(async () => {
      const contacts = await this.loadContacts(userId)
      const hit = contacts.find((c) => this.matches(c, identity))
      const now = new Date().toISOString()
      if (hit) {
        this.applyIdentity(hit, identity)
        if (name && (!hit.name || hit.name === 'Unknown')) hit.name = name.trim().slice(0, 200)
        hit.updatedAt = now
        await this.docs.write(userId, KIND, contacts, 'contacts')
        return hit
      }
      if (!normEmail(identity.email) && !normPhone(identity.phone) && !normHandle(identity.handle) && !name) {
        throw new BadRequestException('Provide a name, email, phone or handle')
      }
      if (contacts.length >= MAX_CONTACTS) throw new BadRequestException('Contact limit reached')
      const contact: ContactRecord = {
        id: randomUUID(),
        name: (name ?? normEmail(identity.email) ?? normHandle(identity.handle) ?? 'Unknown').toString().trim().slice(0, 200) || 'Unknown',
        emails: [], phones: [], handles: [], tags: [], notes: '', stage: 'lead', createdAt: now, updatedAt: now,
      }
      this.applyIdentity(contact, identity)
      contacts.unshift(contact)
      await this.docs.write(userId, KIND, contacts, 'contacts')
      return contact
    })
  }

  create(userId: string, input: { name?: string; email?: string; phone?: string; handle?: string; platform?: string; tags?: string[]; notes?: string; stage?: ContactStage }) {
    return this.serialize(async () => {
      const contacts = await this.loadContacts(userId)
      const identity: ContactIdentity = { email: input.email, phone: input.phone, handle: input.handle, platform: input.platform }
      if (!input.name && !input.email && !input.phone && !input.handle) throw new BadRequestException('Provide a name, email, phone or handle')
      const dupe = contacts.find((c) => this.matches(c, identity))
      if (dupe) throw new BadRequestException(`A contact with that identifier already exists (${dupe.name}). Use merge or update it.`)
      const now = new Date().toISOString()
      const contact: ContactRecord = {
        id: randomUUID(), name: (input.name ?? input.email ?? input.handle ?? input.phone ?? 'Unknown').trim().slice(0, 200),
        emails: [], phones: [], handles: [], tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 30),
        notes: (input.notes ?? '').slice(0, 5000), stage: input.stage ?? 'lead', createdAt: now, updatedAt: now,
      }
      this.applyIdentity(contact, identity)
      contacts.unshift(contact)
      await this.docs.write(userId, KIND, contacts, 'contacts')
      return contact
    })
  }

  update(userId: string, id: string, patch: { name?: string; tags?: string[]; notes?: string; stage?: ContactStage; addEmail?: string; addPhone?: string; addHandle?: string; platform?: string }) {
    return this.serialize(async () => {
      const contacts = await this.loadContacts(userId)
      const c = contacts.find((x) => x.id === id)
      if (!c) throw new NotFoundException('Contact not found')
      if (patch.name !== undefined) c.name = patch.name.trim().slice(0, 200) || c.name
      if (patch.tags !== undefined) c.tags = [...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30)
      if (patch.notes !== undefined) c.notes = patch.notes.slice(0, 5000)
      if (patch.stage !== undefined) c.stage = patch.stage
      this.applyIdentity(c, { email: patch.addEmail, phone: patch.addPhone, handle: patch.addHandle, platform: patch.platform })
      c.updatedAt = new Date().toISOString()
      await this.docs.write(userId, KIND, contacts, 'contacts')
      return c
    })
  }

  remove(userId: string, id: string) {
    return this.serialize(async () => {
      const contacts = await this.loadContacts(userId)
      if (!contacts.some((c) => c.id === id)) throw new NotFoundException('Contact not found')
      await this.docs.write(userId, KIND, contacts.filter((c) => c.id !== id), 'contacts')
      const interactions = await this.loadInteractions(userId)
      await this.docs.write(userId, KIND, interactions.filter((i) => i.contactId !== id), 'interactions')
      return { ok: true }
    })
  }

  addInteraction(userId: string, contactId: string, input: { channel: string; direction: InteractionDirection; text: string; at?: string; meta?: Record<string, unknown> }) {
    return this.serialize(async () => {
      const contacts = await this.loadContacts(userId)
      const c = contacts.find((x) => x.id === contactId)
      if (!c) throw new NotFoundException('Contact not found')
      const at = input.at && !Number.isNaN(Date.parse(input.at)) ? new Date(input.at).toISOString() : new Date().toISOString()
      const rec: InteractionRecord = {
        id: randomUUID(), contactId, channel: input.channel.trim().toLowerCase().slice(0, 40), direction: input.direction,
        text: input.text.slice(0, 4000), at, meta: input.meta,
      }
      const interactions = await this.loadInteractions(userId)
      interactions.push(rec)
      if (interactions.length > MAX_INTERACTIONS) interactions.splice(0, interactions.length - MAX_INTERACTIONS)
      await this.docs.write(userId, KIND, interactions, 'interactions')
      if (!c.lastInteractionAt || at > c.lastInteractionAt) c.lastInteractionAt = at
      if (rec.direction === 'inbound' && c.stage === 'lead') c.stage = 'engaged'
      if (rec.direction === 'outbound' && c.stage === 'lead') c.stage = 'contacted'
      c.updatedAt = new Date().toISOString()
      await this.docs.write(userId, KIND, contacts, 'contacts')
      return rec
    })
  }

  /** Cross-channel ingest: resolve (or create) the person by any identifier, then log the interaction. */
  async ingest(userId: string, input: ContactIdentity & { name?: string; channel: string; direction: InteractionDirection; text: string; at?: string; meta?: Record<string, unknown> }) {
    const contact = await this.findOrCreate(userId, input, input.name)
    const interaction = await this.addInteraction(userId, contact.id, input)
    return { contact, interaction }
  }

  /** Merges duplicate contacts into the primary: identifiers, tags, notes and timelines are combined. */
  merge(userId: string, primaryId: string, duplicateIds: string[]) {
    return this.serialize(async () => {
      const ids = [...new Set(duplicateIds)].filter((d) => d !== primaryId)
      if (!ids.length) throw new BadRequestException('Provide at least one duplicate id different from the primary')
      const contacts = await this.loadContacts(userId)
      const primary = contacts.find((c) => c.id === primaryId)
      if (!primary) throw new NotFoundException('Primary contact not found')
      const dupes = contacts.filter((c) => ids.includes(c.id))
      if (dupes.length !== ids.length) throw new NotFoundException('One or more duplicate contacts were not found')
      for (const d of dupes) {
        for (const e of d.emails) if (!primary.emails.includes(e)) primary.emails.push(e)
        for (const p of d.phones) if (!primary.phones.includes(p)) primary.phones.push(p)
        for (const h of d.handles) if (!primary.handles.some((x) => x.handle === h.handle && x.platform === h.platform)) primary.handles.push(h)
        primary.tags = [...new Set([...primary.tags, ...d.tags])].slice(0, 30)
        if (d.notes && !primary.notes.includes(d.notes)) primary.notes = `${primary.notes}${primary.notes ? '\n' : ''}[merged from ${d.name}] ${d.notes}`.slice(0, 5000)
        if (CONTACT_STAGES.indexOf(d.stage) > CONTACT_STAGES.indexOf(primary.stage) && d.stage !== 'lost') primary.stage = d.stage
        if (d.lastInteractionAt && (!primary.lastInteractionAt || d.lastInteractionAt > primary.lastInteractionAt)) primary.lastInteractionAt = d.lastInteractionAt
        if (d.createdAt < primary.createdAt) primary.createdAt = d.createdAt
      }
      primary.mergedFrom = [...new Set([...(primary.mergedFrom ?? []), ...ids])]
      primary.updatedAt = new Date().toISOString()
      const interactions = await this.loadInteractions(userId)
      for (const i of interactions) if (ids.includes(i.contactId)) i.contactId = primaryId
      await this.docs.write(userId, KIND, contacts.filter((c) => !ids.includes(c.id)), 'contacts')
      await this.docs.write(userId, KIND, interactions, 'interactions')
      return primary
    })
  }

  /** Groups of contacts that share an identifier or have the same normalized name. */
  async duplicates(userId: string) {
    const contacts = await this.loadContacts(userId)
    const parent = new Map<string, string>()
    const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!))
    contacts.forEach((c) => parent.set(c.id, c.id))
    const seen = new Map<string, string>()
    const reasons = new Map<string, Set<string>>()
    for (const c of contacts) {
      const keys = [
        ...c.emails.map((e) => `e:${e}`), ...c.phones.map((p) => `p:${p}`), ...c.handles.map((h) => `h:${h.handle}`),
        ...(c.name && c.name !== 'Unknown' ? [`n:${c.name.trim().toLowerCase()}`] : []),
      ]
      for (const k of keys) {
        const other = seen.get(k)
        if (other) {
          parent.set(find(c.id), find(other))
          const r = reasons.get(k[0]) ?? new Set()
          r.add(k.slice(2))
          reasons.set(k[0], r)
        } else seen.set(k, c.id)
      }
    }
    const groups = new Map<string, ContactRecord[]>()
    for (const c of contacts) {
      const root = find(c.id)
      groups.set(root, [...(groups.get(root) ?? []), c])
    }
    return [...groups.values()].filter((g) => g.length > 1).map((g) => ({ contacts: g }))
  }

  /** Context brief the agent reads before replying to this contact. */
  async brief(userId: string, id: string, outreach: { channel: string; status: string; hook: string; sentAt: string; revenue: number }[] = []) {
    const { contact, timeline } = await this.get(userId, id)
    const channels: Record<string, number> = {}
    for (const t of timeline) channels[t.channel] = (channels[t.channel] ?? 0) + 1
    const inbound = timeline.filter((t) => t.direction === 'inbound')
    const outbound = timeline.filter((t) => t.direction === 'outbound')
    const last = timeline.filter((t) => t.direction !== 'note').slice(-1)[0]
    const daysSince = last ? Math.floor((Date.now() - Date.parse(last.at)) / 86_400_000) : null
    const recent = timeline.slice(-8).map((t) => `${t.at.slice(0, 16).replace('T', ' ')} [${t.channel}/${t.direction}] ${t.text.replace(/\s+/g, ' ').slice(0, 220)}`)
    const preferred = Object.entries(channels).sort((a, b) => b[1] - a[1])[0]?.[0]
    const awaitingReply = last?.direction === 'outbound'
    const lines = [
      `${contact.name} — stage: ${contact.stage}${contact.tags.length ? `; tags: ${contact.tags.join(', ')}` : ''}.`,
      `Identifiers: ${[...contact.emails, ...contact.phones, ...contact.handles.map((h) => `${h.platform ? h.platform + ':' : ''}@${h.handle}`)].join(', ') || 'none'}.`,
      timeline.length
        ? `${timeline.length} interactions across ${Object.keys(channels).length} channel(s) (${Object.entries(channels).map(([k, v]) => `${k}×${v}`).join(', ')}); ${inbound.length} inbound, ${outbound.length} outbound.`
        : 'No interactions recorded yet.',
      daysSince !== null ? `Last contact ${daysSince === 0 ? 'today' : `${daysSince} day(s) ago`} via ${last!.channel} (${last!.direction}).` : '',
      awaitingReply ? 'We sent the last message and are still awaiting their reply — keep the follow-up short and add new value.' : last ? 'They spoke last — reply promptly and address their latest message directly.' : '',
      preferred ? `Most-used channel: ${preferred}.` : '',
      contact.notes ? `Notes: ${contact.notes.replace(/\s+/g, ' ').slice(0, 600)}` : '',
      outreach.length ? `Outreach: ${outreach.length} item(s), statuses: ${[...new Set(outreach.map((o) => o.status))].join(', ')}; revenue so far ${outreach.reduce((s, o) => s + o.revenue, 0)}.` : '',
    ].filter(Boolean)
    return {
      contactId: id,
      summary: lines.join('\n'),
      stage: contact.stage,
      tags: contact.tags,
      channels,
      preferredChannel: preferred ?? null,
      daysSinceLastContact: daysSince,
      awaitingTheirReply: awaitingReply,
      recentInteractions: recent,
    }
  }
}
