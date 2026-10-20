import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'
import { ConnectorsService } from '../connectors/connectors.service'
import { Moment, MomentAction, MomentKind, MomentSettings, MomentsFile, MomentsStore, normalizeMomentSettings } from './moments.store'

const TICK_MS = 15 * 60 * 1000
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const STALL_DAYS = 7

type Candidate = Omit<Moment, 'id' | 'status' | 'delivered' | 'createdAt' | 'updatedAt'>
interface CalEvent {
  id: string
  summary?: string
  location?: string
  hangoutLink?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean }>
}

function localParts(tz: string, d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d)
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return { dateKey: `${g('year')}-${g('month')}-${g('day')}`, minutes: (Number(g('hour')) % 24) * 60 + Number(g('minute')) }
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

@Injectable()
export class MomentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MomentsService.name)
  private timer?: NodeJS.Timeout
  private ticking = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly connectors: ConnectorsService,
    private readonly store: MomentsStore,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async list(userId: string, status?: string) {
    const data = await this.store.load(userId)
    this.wakeSnoozed(data)
    return status ? data.moments.filter((m) => m.status === status) : data.moments
  }

  async getSettings(userId: string) {
    return (await this.store.load(userId)).settings
  }

  async updateSettings(userId: string, patch: Partial<MomentSettings>) {
    const data = await this.store.load(userId)
    data.settings = normalizeMomentSettings({
      ...data.settings,
      ...patch,
      quietHours: { ...data.settings.quietHours, ...(patch?.quietHours ?? {}) },
      kinds: { ...data.settings.kinds, ...(patch?.kinds ?? {}) },
    })
    await this.store.save(userId, data)
    return data.settings
  }

  async snooze(userId: string, id: string, minutes = 60) {
    const m = await this.mutate(userId, id, (x) => {
      x.status = 'snoozed'
      x.snoozedUntil = new Date(Date.now() + Math.max(5, Math.min(7 * 24 * 60, Number(minutes) || 60)) * 60000).toISOString()
    })
    return m
  }

  dismiss(userId: string, id: string) {
    return this.mutate(userId, id, (x) => {
      x.status = 'dismissed'
    })
  }

  async act(userId: string, id: string, actionId?: string) {
    let chosen: MomentAction | undefined
    const moment = await this.mutate(userId, id, (x) => {
      chosen = actionId ? x.actions.find((a) => a.id === actionId) : x.actions[0]
      if (actionId && !chosen) throw new BadRequestException('Unknown action')
      x.status = 'acted'
      x.actedActionId = chosen?.id
    })
    return { moment, action: chosen ?? null }
  }

  /** Detect now for a single user (manual "check now"). Respects quiet hours / daily caps for delivery. */
  async runForUser(userId: string) {
    const data = await this.store.load(userId)
    const created = await this.detectAndDeliver(userId, data)
    return { created: created.length, moments: created }
  }

  // ── Worker ────────────────────────────────────────────────────────────────

  async tick() {
    if (this.ticking) return
    this.ticking = true
    try {
      for (const userId of await this.store.listUserIds()) {
        try {
          const data = await this.store.load(userId)
          if (!data.settings.enabled) continue
          await this.detectAndDeliver(userId, data)
        } catch (e: any) {
          this.logger.warn(`Moments tick failed for ${userId}: ${e?.message ?? e}`)
        }
      }
    } finally {
      this.ticking = false
    }
  }

  private async detectAndDeliver(userId: string, data: MomentsFile): Promise<Moment[]> {
    const s = data.settings
    const woken = this.wakeSnoozed(data)
    const candidates: Candidate[] = []
    const run = async (kind: MomentKind, fn: () => Promise<Candidate[]>) => {
      if (!s.kinds[kind]) return
      try {
        candidates.push(...(await fn()))
      } catch (e: any) {
        this.logger.debug(`Moment detector ${kind} failed for ${userId}: ${e?.message ?? e}`)
      }
    }
    const [calOk, gmailOk] = await Promise.all([this.connected(userId, 'google_calendar'), this.connected(userId, 'google_gmail')])
    const events = calOk ? await this.upcomingEvents(userId).catch(() => [] as CalEvent[]) : []
    await run('meeting_soon', () => this.detectMeetings(userId, events))
    await run('calendar_conflict', async () => this.detectConflicts(events))
    if (gmailOk) await run('unanswered_email', () => this.detectUnanswered(userId))
    await run('goal_stalled', () => this.detectStalledGoals(userId))
    await run('watch_hit', () => this.detectWatchHits(userId))

    const now = new Date().toISOString()
    const seen = new Set(data.seenKeys)
    const created: Moment[] = []
    for (const c of candidates) {
      if (seen.has(c.key)) continue
      seen.add(c.key)
      data.seenKeys.push(c.key)
      const m: Moment = { ...c, id: randomUUID(), status: 'active', delivered: false, createdAt: now, updatedAt: now }
      data.moments.unshift(m)
      created.push(m)
    }

    // Expire stale undelivered moments, then deliver what the budget allows.
    for (const m of data.moments) {
      if (m.status === 'active' && m.expiresAt && m.expiresAt < now) m.status = 'dismissed'
    }
    const pending = data.moments.filter((m) => m.status === 'active' && !m.delivered).concat(woken).reverse()
    if (pending.length && !this.inQuietHours(s)) {
      const today = localParts(s.timezone).dateKey
      let budget = s.maxPerDay - data.moments.filter((m) => m.deliveredAt && localParts(s.timezone, new Date(m.deliveredAt)).dateKey === today).length
      for (const m of pending) {
        if (budget <= 0) break
        await this.deliver(userId, m)
        budget -= 1
      }
    }
    data.lastRunAt = now
    await this.store.save(userId, data)
    return created
  }

  private async deliver(userId: string, m: Moment) {
    await this.notifications.create(userId, m.title, m.body.slice(0, 300), m.kind === 'calendar_conflict' ? 'warning' : 'info').catch(() => undefined)
    await this.push.sendToUser(userId, { title: `OpenAgents — ${m.title}`.slice(0, 120), body: m.body.slice(0, 160), url: '/moments' }).catch(() => undefined)
    m.delivered = true
    m.deliveredAt = new Date().toISOString()
    m.updatedAt = m.deliveredAt
  }

  private inQuietHours(s: MomentSettings) {
    if (!s.quietHours.enabled) return false
    const { minutes } = localParts(s.timezone)
    const start = toMin(s.quietHours.start)
    const end = toMin(s.quietHours.end)
    return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end
  }

  /** Returns snoozed moments whose snooze expired (re-armed for delivery). */
  private wakeSnoozed(data: MomentsFile): Moment[] {
    const now = new Date().toISOString()
    const woken: Moment[] = []
    for (const m of data.moments) {
      if (m.status === 'snoozed' && m.snoozedUntil && m.snoozedUntil <= now) {
        m.status = 'active'
        m.snoozedUntil = undefined
        m.delivered = false
        m.updatedAt = now
        woken.push(m)
      }
    }
    return woken.filter((m) => !m.delivered && false)
  }

  private async mutate(userId: string, id: string, fn: (m: Moment) => void) {
    const data = await this.store.load(userId)
    const m = data.moments.find((x) => x.id === id)
    if (!m) throw new NotFoundException('Moment not found')
    fn(m)
    m.updatedAt = new Date().toISOString()
    await this.store.save(userId, data)
    return m
  }

  private async connected(userId: string, connectorId: string) {
    try {
      return (await this.connectors.getConnection(userId, connectorId)).connected
    } catch {
      return false
    }
  }

  // ── Detectors ─────────────────────────────────────────────────────────────

  private async upcomingEvents(userId: string): Promise<CalEvent[]> {
    const params = new URLSearchParams({
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '30',
    })
    const res = await this.connectors.fetchGoogle(userId, 'google_calendar', `${CAL}?${params}`)
    return (((await res.json()) as { items?: CalEvent[] }).items ?? []).filter((e) => e.start?.dateTime && e.end?.dateTime)
  }

  private async detectMeetings(userId: string, events: CalEvent[]): Promise<Candidate[]> {
    const now = Date.now()
    const soon = events.filter((e) => {
      const t = new Date(e.start!.dateTime!).getTime()
      return t > now && t - now <= 15 * 60000
    })
    const out: Candidate[] = []
    for (const e of soon) {
      const attendees = (e.attendees ?? []).filter((a) => !a.self)
      const terms = [
        ...attendees.map((a) => a.displayName || a.email?.split('@')[0] || ''),
        ...(e.summary ?? '').split(/\s+/).filter((w) => w.length > 4),
      ].filter(Boolean).slice(0, 8)
      const facts = terms.length
        ? await this.prisma.memoryFact.findMany({
          where: { userId, OR: terms.flatMap((t) => [{ value: { contains: t } }, { key: { contains: t } }]) },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: { key: true, value: true },
        }).catch(() => [] as Array<{ key: string; value: string }>)
        : []
      const mins = Math.max(1, Math.round((new Date(e.start!.dateTime!).getTime() - now) / 60000))
      out.push({
        key: `meeting:${e.id}:${e.start!.dateTime}`,
        kind: 'meeting_soon',
        title: `${e.summary ?? 'Meeting'} in ${mins} min`,
        body: `${attendees.length ? `With ${attendees.slice(0, 4).map((a) => a.displayName || a.email).join(', ')}. ` : ''}${e.location ? `Location: ${e.location}.` : ''}`.trim() || 'Your next meeting is starting soon.',
        context: facts.map((f) => `${f.key}: ${f.value}`.slice(0, 200)),
        actions: [
          { id: 'prep', label: 'Prep with agent', href: `/chat?prompt=${encodeURIComponent(`Help me prepare for "${e.summary ?? 'my meeting'}"`)}` },
          ...(e.hangoutLink ? [{ id: 'join', label: 'Join call', href: e.hangoutLink }] : []),
        ],
        expiresAt: e.end!.dateTime,
      })
    }
    return out
  }

  private detectConflicts(events: CalEvent[]): Candidate[] {
    const out: Candidate[] = []
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i]
        const b = events[j]
        if (new Date(a.start!.dateTime!) < new Date(b.end!.dateTime!) && new Date(b.start!.dateTime!) < new Date(a.end!.dateTime!)) {
          const [x, y] = [a.id, b.id].sort()
          out.push({
            key: `conflict:${x}:${y}`,
            kind: 'calendar_conflict',
            title: 'Calendar conflict',
            body: `"${a.summary ?? 'Event'}" overlaps with "${b.summary ?? 'Event'}" (${new Date(b.start!.dateTime!).toUTCString()}).`,
            actions: [{ id: 'resolve', label: 'Ask agent to resolve', href: `/chat?prompt=${encodeURIComponent(`Help me resolve the calendar conflict between "${a.summary}" and "${b.summary}"`)}` }],
            expiresAt: a.start!.dateTime! < b.start!.dateTime! ? b.start!.dateTime : a.start!.dateTime,
          })
        }
      }
    }
    return out
  }

  /** Important inbox threads older than 3 days whose latest message isn't from the user. */
  private async detectUnanswered(userId: string): Promise<Candidate[]> {
    const q = encodeURIComponent('in:inbox is:important older_than:3d newer_than:14d -category:promotions -in:chats')
    const res = await this.connectors.fetchGoogle(userId, 'google_gmail', `${GMAIL}/threads?maxResults=10&q=${q}`)
    const threads = ((await res.json()) as { threads?: Array<{ id: string }> }).threads ?? []
    const out: Candidate[] = []
    for (const t of threads.slice(0, 10)) {
      try {
        const r = await this.connectors.fetchGoogle(userId, 'google_gmail', `${GMAIL}/threads/${encodeURIComponent(t.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)
        const thread = (await r.json()) as { messages?: Array<{ id: string; labelIds?: string[]; payload?: { headers?: Array<{ name: string; value: string }> } }> }
        const last = thread.messages?.[thread.messages.length - 1]
        if (!last || (last.labelIds ?? []).includes('SENT')) continue
        const h = (n: string) => last.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? ''
        if (/no-?reply|notifications?@/i.test(h('from'))) continue
        const from = h('from').replace(/\s*<[^>]+>/, '').replace(/"/g, '') || 'someone'
        out.push({
          key: `unanswered:${last.id}`,
          kind: 'unanswered_email',
          title: `Unanswered for 3+ days: ${from}`,
          body: `"${h('subject') || '(no subject)'}" is still waiting on your reply.`,
          actions: [
            { id: 'draft', label: 'Draft a reply', href: '/inbox' },
            { id: 'open', label: 'Open in Gmail', href: `https://mail.google.com/mail/u/0/#inbox/${t.id}` },
          ],
        })
      } catch {
        // skip thread
      }
      if (out.length >= 5) break
    }
    return out
  }

  private async detectStalledGoals(userId: string): Promise<Candidate[]> {
    const cutoff = new Date(Date.now() - STALL_DAYS * 86400000)
    const goals = await this.prisma.goal.findMany({
      where: { userId, status: 'active', updatedAt: { lt: cutoff } },
      orderBy: { updatedAt: 'asc' },
      take: 3,
      select: { id: true, title: true, progress: true, updatedAt: true },
    })
    const week = Math.floor(Date.now() / (7 * 86400000))
    return goals.map((g) => ({
      key: `goal:${g.id}:w${week}`,
      kind: 'goal_stalled' as const,
      title: `Goal stalled: ${g.title}`,
      body: `No progress since ${g.updatedAt.toISOString().slice(0, 10)} (${g.progress}% done). Want to plan the next step?`,
      actions: [{ id: 'plan', label: 'Plan next step', href: `/chat?prompt=${encodeURIComponent(`Help me plan the next step for my goal "${g.title}"`)}` }],
    }))
  }

  private async detectWatchHits(userId: string): Promise<Candidate[]> {
    const since = new Date(Date.now() - 24 * 3600 * 1000)
    const watches = await this.prisma.watchTask.findMany({
      where: { userId, lastFiredAt: { gte: since } },
      take: 10,
      select: { id: true, name: true, condition: true, target: true, lastFiredAt: true, lastDetail: true },
    })
    return watches
      .filter((w) => /price|flight|fare|ticket|deal|\$|€|£/i.test(`${w.name} ${w.condition} ${w.target}`))
      .map((w) => ({
        key: `watch:${w.id}:${w.lastFiredAt?.toISOString()}`,
        kind: 'watch_hit' as const,
        title: `Watch hit: ${w.name}`,
        body: (w.lastDetail ?? w.condition).slice(0, 280),
        actions: [{ id: 'open', label: 'Open watched page', href: /^https?:\/\//.test(w.target) ? w.target : undefined }],
      }))
  }
}
