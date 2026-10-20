import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { LLMProvider } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { ConnectorsService } from '../connectors/connectors.service'
import {
  EmailAutopilotStore,
  EmailDraft,
  EmailRule,
  PendingAction,
  RISKY_ACTIONS,
  RuleAction,
  StyleProfile,
  TRIAGE_CATEGORIES,
  TriageCategory,
  TriagedEmail,
} from './email-autopilot.store'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CONNECTOR = 'google_gmail'
const MAX_AUTO_DRAFTS_PER_RUN = 3
const RULE_ACTIONS: RuleAction[] = ['label', 'archive', 'draft', 'forward']

type GmailHeader = { name: string; value: string }
interface GmailMessage {
  id: string
  threadId: string
  snippet?: string
  labelIds?: string[]
  internalDate?: string
  payload?: { headers?: GmailHeader[]; mimeType?: string; body?: { data?: string }; parts?: any[] }
}

export interface RuleInput {
  match?: string
  action?: RuleAction
  value?: string
  enabled?: boolean
  requireApproval?: boolean
}

@Injectable()
export class EmailAutopilotService {
  private readonly logger = new Logger(EmailAutopilotService.name)
  private readonly running = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly connectors: ConnectorsService,
    private readonly store: EmailAutopilotStore,
  ) {}

  // ── Read APIs ─────────────────────────────────────────────────────────────

  async getTriage(userId: string) {
    const data = await this.store.load(userId)
    const counts = Object.fromEntries(TRIAGE_CATEGORIES.map((c) => [c, 0])) as Record<TriageCategory, number>
    for (const t of data.triage) counts[t.category] += 1
    return { lastRunAt: data.lastRunAt ?? null, counts, items: data.triage }
  }

  async listDrafts(userId: string, status?: string) {
    const data = await this.store.load(userId)
    return status ? data.drafts.filter((d) => d.status === status) : data.drafts
  }

  async listPendingActions(userId: string) {
    return (await this.store.load(userId)).pendingActions
  }

  async getStyle(userId: string) {
    return { profile: (await this.store.load(userId)).style }
  }

  // ── Rules ─────────────────────────────────────────────────────────────────

  async listRules(userId: string) {
    return (await this.store.load(userId)).rules
  }

  async createRule(userId: string, input: RuleInput) {
    const rule = this.normalizeRule({ id: randomUUID(), createdAt: new Date().toISOString() } as EmailRule, input, true)
    const data = await this.store.load(userId)
    data.rules.push(rule)
    await this.store.save(userId, data)
    return rule
  }

  async updateRule(userId: string, id: string, input: RuleInput) {
    const data = await this.store.load(userId)
    const idx = data.rules.findIndex((r) => r.id === id)
    if (idx < 0) throw new NotFoundException('Rule not found')
    data.rules[idx] = this.normalizeRule(data.rules[idx], input, false)
    await this.store.save(userId, data)
    return data.rules[idx]
  }

  async deleteRule(userId: string, id: string) {
    const data = await this.store.load(userId)
    const before = data.rules.length
    data.rules = data.rules.filter((r) => r.id !== id)
    await this.store.save(userId, data)
    return { deleted: before !== data.rules.length }
  }

  private normalizeRule(base: EmailRule, input: RuleInput, creating: boolean): EmailRule {
    const match = (input.match ?? base.match ?? '').trim()
    const action = input.action ?? base.action
    if (!match) throw new BadRequestException('match is required')
    if (!RULE_ACTIONS.includes(action)) throw new BadRequestException(`action must be one of ${RULE_ACTIONS.join(', ')}`)
    const value = (input.value ?? base.value)?.trim() || undefined
    if (action === 'label' && !value) throw new BadRequestException('label rules need a value (label name)')
    if (action === 'forward' && !(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
      throw new BadRequestException('forward rules need a valid email address as value')
    }
    const risky = RISKY_ACTIONS.includes(action)
    return {
      ...base,
      match: match.slice(0, 500),
      action,
      value,
      enabled: input.enabled ?? (creating ? true : base.enabled),
      requireApproval: risky ? true : (input.requireApproval ?? base.requireApproval ?? false),
    }
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  async runNow(userId: string) {
    if (this.running.has(userId)) throw new BadRequestException('Autopilot is already running')
    await this.assertConnected(userId)
    this.running.add(userId)
    try {
      const data = await this.store.load(userId)
      if (!data.style) await this.learnStyle(userId).catch((e) => this.logger.warn(`Style learning failed: ${e?.message ?? e}`))

      const messages = await this.fetchInbox(userId)
      const triage = await this.classify(userId, messages)
      data.triage = triage
      data.lastRunAt = new Date().toISOString()

      const processed = new Set(data.processedIds)
      const fresh = triage.filter((t) => !processed.has(t.id))
      let drafted = 0
      let ruleHits = 0
      let pending = 0

      for (const email of fresh) {
        for (const rule of data.rules.filter((r) => r.enabled && this.matches(rule.match, email))) {
          ruleHits += 1
          if (rule.requireApproval || RISKY_ACTIONS.includes(rule.action)) {
            data.pendingActions.unshift({
              id: randomUUID(),
              ruleId: rule.id,
              action: rule.action,
              value: rule.value,
              messageId: email.id,
              subject: email.subject,
              from: email.from,
              status: 'pending',
              createdAt: new Date().toISOString(),
            })
            pending += 1
          } else if (rule.action === 'draft') {
            if (await this.createReplyDraft(userId, data, email, rule.id)) drafted += 1
          } else if (rule.action === 'label') {
            await this.applyLabel(userId, email.id, rule.value!).catch((e) => this.logger.warn(`Label failed: ${e?.message ?? e}`))
          }
        }
        const autoReply = (email.category === 'urgent' || email.category === 'reply_needed')
          && drafted < MAX_AUTO_DRAFTS_PER_RUN
          && !data.drafts.some((d) => d.messageId === email.id)
        if (autoReply && (await this.createReplyDraft(userId, data, email))) drafted += 1
        data.processedIds.push(email.id)
      }

      await this.store.save(userId, data)
      return { triaged: triage.length, newMessages: fresh.length, drafted, ruleHits, pendingApprovals: pending }
    } finally {
      this.running.delete(userId)
    }
  }

  // ── Drafts ────────────────────────────────────────────────────────────────

  async editDraft(userId: string, id: string, patch: { body?: string; subject?: string; to?: string }) {
    const data = await this.store.load(userId)
    const draft = this.findDraft(data.drafts, id)
    if (draft.status !== 'pending') throw new BadRequestException('Only pending drafts can be edited')
    if (typeof patch.body === 'string') draft.body = patch.body.slice(0, 20000)
    if (typeof patch.subject === 'string') draft.subject = patch.subject.slice(0, 500)
    if (typeof patch.to === 'string' && patch.to.trim()) draft.to = patch.to.trim()
    draft.updatedAt = new Date().toISOString()
    if (draft.gmailDraftId) {
      await this.connectors.fetchGoogle(userId, CONNECTOR, `${GMAIL}/drafts/${encodeURIComponent(draft.gmailDraftId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.gmailDraftId, message: { raw: this.raw(draft), threadId: draft.threadId } }),
      }).catch((e) => this.logger.warn(`Gmail draft update failed: ${e?.message ?? e}`))
    }
    await this.store.save(userId, data)
    return draft
  }

  /** Explicit user approval: the only path that sends email. */
  async approveDraft(userId: string, id: string) {
    const data = await this.store.load(userId)
    const draft = this.findDraft(data.drafts, id)
    if (draft.status !== 'pending') throw new BadRequestException(`Draft is ${draft.status}`)
    draft.status = 'approved'
    try {
      if (draft.gmailDraftId) {
        await this.connectors.fetchGoogle(userId, CONNECTOR, `${GMAIL}/drafts/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: draft.gmailDraftId }),
        })
      } else {
        await this.sendRaw(userId, this.raw(draft), draft.threadId)
      }
      draft.status = 'sent'
    } catch (e: any) {
      draft.status = 'failed'
      draft.error = String(e?.message ?? e).slice(0, 300)
    }
    draft.updatedAt = new Date().toISOString()
    await this.store.save(userId, data)
    return draft
  }

  async rejectDraft(userId: string, id: string) {
    const data = await this.store.load(userId)
    const draft = this.findDraft(data.drafts, id)
    if (draft.status !== 'pending') throw new BadRequestException(`Draft is ${draft.status}`)
    if (draft.gmailDraftId) {
      await this.connectors.fetchGoogle(userId, CONNECTOR, `${GMAIL}/drafts/${encodeURIComponent(draft.gmailDraftId)}`, { method: 'DELETE' })
        .catch(() => undefined)
    }
    draft.status = 'rejected'
    draft.updatedAt = new Date().toISOString()
    await this.store.save(userId, data)
    return draft
  }

  async resolveAction(userId: string, id: string, approve: boolean) {
    const data = await this.store.load(userId)
    const action = data.pendingActions.find((a) => a.id === id)
    if (!action) throw new NotFoundException('Action not found')
    if (action.status !== 'pending') throw new BadRequestException(`Action is ${action.status}`)
    if (!approve) {
      action.status = 'rejected'
    } else {
      try {
        await this.executeAction(userId, data, action)
        action.status = 'done'
      } catch (e: any) {
        this.logger.warn(`Approved action failed: ${e?.message ?? e}`)
        action.status = 'failed'
      }
    }
    await this.store.save(userId, data)
    return action
  }

  private async executeAction(userId: string, data: Awaited<ReturnType<EmailAutopilotStore['load']>>, a: PendingAction) {
    switch (a.action) {
      case 'archive':
        return this.modify(userId, a.messageId, [], ['INBOX'])
      case 'label':
        return this.applyLabel(userId, a.messageId, a.value!)
      case 'forward':
        return this.forward(userId, a.messageId, a.value!)
      case 'draft': {
        const email = data.triage.find((t) => t.id === a.messageId)
        if (email) await this.createReplyDraft(userId, data, email, a.ruleId)
        return
      }
    }
  }

  // ── Style ─────────────────────────────────────────────────────────────────

  async learnStyle(userId: string): Promise<StyleProfile> {
    await this.assertConnected(userId)
    const list = await this.gmailJson<{ messages?: Array<{ id: string }> }>(userId, `/messages?maxResults=20&q=${encodeURIComponent('in:sent')}`)
    const bodies: string[] = []
    for (const { id } of (list.messages ?? []).slice(0, 20)) {
      try {
        const msg = await this.gmailJson<GmailMessage>(userId, `/messages/${encodeURIComponent(id)}?format=full`)
        const text = stripQuoted(extractText(msg.payload)).slice(0, 1500)
        if (text.length > 10) bodies.push(text)
      } catch {
        // skip
      }
    }
    const firstLines = bodies.map((b) => b.split('\n').find((l) => l.trim())?.trim() ?? '')
    const lastLines = bodies.map((b) => b.split('\n').filter((l) => l.trim()).slice(-2).join(' | '))
    const greeting = mode(firstLines.map((l) => l.match(/^(hi|hey|hello|dear|good (morning|afternoon))\b[^,\n]*/i)?.[1] ?? '').filter(Boolean)) || 'Hi'
    const signOff = mode(lastLines.map((l) => l.match(/\b(thanks|thank you|best|cheers|regards|best regards|kind regards)\b/i)?.[1] ?? '').filter(Boolean)) || 'Best'
    const avgLength = bodies.length ? Math.round(bodies.reduce((s, b) => s + b.split(/\s+/).length, 0) / bodies.length) : 80

    let summary = `Greets with "${greeting}", signs off with "${signOff}", around ${avgLength} words per email.`
    let tone = 'neutral'
    if (bodies.length) {
      const out = await this.complete(
        userId,
        `Analyse these emails I wrote and describe my writing style in 3-5 short bullet points (tone, length, formality, structure, quirks). Then on the last line write "TONE: <one or two words>".\n\n${bodies.slice(0, 12).map((b, i) => `--- Email ${i + 1}\n${b.slice(0, 800)}`).join('\n')}`,
        'You are an expert writing-style analyst.',
      )
      if (out) {
        tone = out.match(/TONE:\s*(.+)$/im)?.[1]?.trim().slice(0, 40) ?? tone
        summary = out.replace(/TONE:.*$/im, '').trim().slice(0, 1500) || summary
      }
    }
    const profile: StyleProfile = { summary, greeting, signOff, avgLength, tone, samples: bodies.length, updatedAt: new Date().toISOString() }
    const data = await this.store.load(userId)
    data.style = profile
    await this.store.save(userId, data)
    return profile
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async assertConnected(userId: string) {
    let connected = false
    try {
      connected = (await this.connectors.getConnection(userId, CONNECTOR)).connected
    } catch {
      connected = false
    }
    if (!connected) throw new BadRequestException('Gmail is not connected. Link Gmail in Connectors first.')
  }

  private async gmailJson<T>(userId: string, pathAndQuery: string, init?: RequestInit): Promise<T> {
    const res = await this.connectors.fetchGoogle(userId, CONNECTOR, `${GMAIL}${pathAndQuery}`, init)
    return (await res.json()) as T
  }

  private async fetchInbox(userId: string): Promise<GmailMessage[]> {
    const q = encodeURIComponent('in:inbox newer_than:3d -in:chats')
    const list = await this.gmailJson<{ messages?: Array<{ id: string }> }>(userId, `/messages?maxResults=25&q=${q}`)
    const out: GmailMessage[] = []
    for (const { id } of list.messages ?? []) {
      try {
        out.push(await this.gmailJson<GmailMessage>(
          userId,
          `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe&metadataHeaders=Message-ID`,
        ))
      } catch {
        // skip
      }
    }
    return out
  }

  private async classify(userId: string, messages: GmailMessage[]): Promise<TriagedEmail[]> {
    const items: TriagedEmail[] = messages.map((m) => {
      const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? ''
      const fromRaw = h('from')
      const base: TriagedEmail = {
        id: m.id,
        threadId: m.threadId,
        from: fromRaw.replace(/\s*<[^>]+>/, '').replace(/"/g, '').trim() || fromRaw,
        fromEmail: (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim().toLowerCase(),
        subject: h('subject') || '(no subject)',
        snippet: (m.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
        date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : h('date'),
        category: 'fyi',
        reason: 'default',
        messageIdHeader: h('message-id') || undefined,
        unread: (m.labelIds ?? []).includes('UNREAD'),
      }
      const [category, reason] = heuristicCategory(base, Boolean(h('list-unsubscribe')), m.labelIds ?? [])
      return { ...base, category, reason }
    })
    if (!items.length) return items

    const out = await this.complete(
      userId,
      `Classify each email into exactly one of: urgent, reply_needed, fyi, newsletter, invoice. Reply ONLY with JSON array of {"i":number,"c":category,"r":"short reason"}.\n\n${items
        .map((e, i) => `${i}. From: ${e.from} <${e.fromEmail}> | Subject: ${e.subject} | ${e.snippet}`)
        .join('\n')}`,
      'You are an email triage assistant. Output strict JSON only.',
    )
    try {
      const parsed = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1)) as Array<{ i: number; c: string; r?: string }>
      for (const p of parsed) {
        const item = items[p.i]
        if (item && TRIAGE_CATEGORIES.includes(p.c as TriageCategory)) {
          item.category = p.c as TriageCategory
          item.reason = (p.r ?? 'llm').slice(0, 160)
        }
      }
    } catch {
      // keep heuristics
    }
    return items
  }

  private async createReplyDraft(userId: string, data: Awaited<ReturnType<EmailAutopilotStore['load']>>, email: TriagedEmail, ruleId?: string) {
    if (data.drafts.some((d) => d.messageId === email.id && d.status === 'pending')) return false
    const style = data.style
    const body = (await this.complete(
      userId,
      `Draft a reply to this email in my writing style. Output only the email body, no subject line.\n\nMy style: ${style?.summary ?? 'friendly, concise'}\nGreeting: ${style?.greeting ?? 'Hi'} · Sign-off: ${style?.signOff ?? 'Best'} · Target length: ~${style?.avgLength ?? 80} words.\n\nFrom: ${email.from}\nSubject: ${email.subject}\n${email.snippet}\n\nDo not commit to dates, payments or decisions; leave [placeholders] where I must decide.`,
      'You draft email replies on behalf of the user. Never claim to have done things the user has not done.',
    )) || `${style?.greeting ?? 'Hi'} ${email.from.split(' ')[0]},\n\nThanks for your note - I'll get back to you shortly.\n\n${style?.signOff ?? 'Best'}`

    const now = new Date().toISOString()
    const draft: EmailDraft = {
      id: randomUUID(),
      kind: 'reply',
      messageId: email.id,
      threadId: email.threadId,
      to: email.fromEmail,
      subject: /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`,
      body: body.trim(),
      status: 'pending',
      ruleId,
      createdAt: now,
      updatedAt: now,
    }
    try {
      const created = await this.gmailJson<{ id: string }>(userId, '/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { raw: this.raw(draft, email.messageIdHeader), threadId: draft.threadId } }),
      })
      draft.gmailDraftId = created.id
    } catch (e: any) {
      draft.error = `Could not save Gmail draft: ${String(e?.message ?? e).slice(0, 200)}`
    }
    data.drafts.unshift(draft)
    return true
  }

  private raw(d: Pick<EmailDraft, 'to' | 'subject' | 'body'>, inReplyTo?: string) {
    const headers = [
      `To: ${d.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(d.subject, 'utf8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
    ]
    if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`)
    const mime = `${headers.join('\r\n')}\r\n\r\n${Buffer.from(d.body, 'utf8').toString('base64')}`
    return Buffer.from(mime, 'utf8').toString('base64url')
  }

  private async sendRaw(userId: string, raw: string, threadId?: string) {
    await this.connectors.fetchGoogle(userId, CONNECTOR, `${GMAIL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
    })
  }

  private async forward(userId: string, messageId: string, to: string) {
    const msg = await this.gmailJson<GmailMessage>(userId, `/messages/${encodeURIComponent(messageId)}?format=full`)
    const h = (n: string) => msg.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? ''
    const body = `---------- Forwarded message ----------\nFrom: ${h('from')}\nDate: ${h('date')}\nSubject: ${h('subject')}\n\n${extractText(msg.payload)}`
    await this.sendRaw(userId, this.raw({ to, subject: `Fwd: ${h('subject')}`, body }))
  }

  private async modify(userId: string, messageId: string, add: string[], remove: string[]) {
    await this.connectors.fetchGoogle(userId, CONNECTOR, `${GMAIL}/messages/${encodeURIComponent(messageId)}/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
    })
  }

  private async applyLabel(userId: string, messageId: string, name: string) {
    const labels = await this.gmailJson<{ labels?: Array<{ id: string; name: string }> }>(userId, '/labels')
    let label = labels.labels?.find((l) => l.name.toLowerCase() === name.toLowerCase())
    if (!label) {
      label = await this.gmailJson<{ id: string; name: string }>(userId, '/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
      })
    }
    await this.modify(userId, messageId, [label.id], [])
  }

  /** Supports from:, to:, subject:, category: tokens with * wildcards; bare words match subject/snippet. */
  matches(match: string, email: TriagedEmail): boolean {
    const tokens = match.match(/(\w+:"[^"]*"|\w+:\S+|"[^"]*"|\S+)/g) ?? []
    return tokens.every((tok) => {
      const m = tok.match(/^(\w+):(.*)$/)
      const field = m?.[1]?.toLowerCase()
      const value = (m ? m[2] : tok).replace(/^"|"$/g, '').toLowerCase()
      if (!value) return true
      const re = new RegExp(value.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i')
      switch (field) {
        case 'from':
          return value.includes('*') ? new RegExp(`^${re.source}$`, 'i').test(email.fromEmail) || re.test(email.from) : re.test(`${email.from} ${email.fromEmail}`)
        case 'subject':
          return re.test(email.subject)
        case 'category':
          return email.category === value
        default:
          return re.test(`${email.subject} ${email.snippet}`)
      }
    })
  }

  private findDraft(drafts: EmailDraft[], id: string) {
    const d = drafts.find((x) => x.id === id)
    if (!d) throw new NotFoundException('Draft not found')
    return d
  }

  private async complete(userId: string, prompt: string, system: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } }).catch(() => null)
    try {
      const res = await this.llm.complete(
        [{ role: 'user', content: prompt.slice(0, 12000) }],
        [],
        system,
        (settings?.preferredProvider ?? 'ollama') as LLMProvider,
        undefined,
        undefined,
        settings?.preferredModel ?? undefined,
      )
      return (res.content ?? '').trim()
    } catch {
      return ''
    }
  }
}

function heuristicCategory(e: TriagedEmail, hasUnsubscribe: boolean, labels: string[]): [TriageCategory, string] {
  const text = `${e.subject} ${e.snippet}`.toLowerCase()
  if (/\b(invoice|receipt|payment due|amount due|billing statement)\b/.test(text)) return ['invoice', 'billing keywords']
  if (hasUnsubscribe || labels.includes('CATEGORY_PROMOTIONS') || /newsletter|digest|unsubscribe/.test(text)) return ['newsletter', 'bulk mail']
  if (/\b(urgent|asap|immediately|deadline today|action required)\b/.test(text)) return ['urgent', 'urgency keywords']
  if (/\?|\b(can you|could you|please|let me know|thoughts)\b/.test(text) && !/no-?reply/.test(e.fromEmail)) return ['reply_needed', 'question or request']
  return ['fyi', 'informational']
}

function extractText(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8')
  }
  for (const part of payload.parts ?? []) {
    const t = extractText(part)
    if (t) return t
  }
  if (payload.body?.data && !payload.parts) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8').replace(/<[^>]+>/g, ' ')
  }
  return ''
}

function stripQuoted(text: string) {
  const cut = text.search(/\n(On .+wrote:|-{2,} ?Original Message|From: .+\n)/i)
  return (cut > 0 ? text.slice(0, cut) : text).split('\n').filter((l) => !l.startsWith('>')).join('\n').trim()
}

function mode(values: string[]) {
  const counts = new Map<string, number>()
  for (const v of values) {
    const k = v.trim()
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}
