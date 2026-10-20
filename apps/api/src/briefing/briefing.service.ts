import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { GoalService } from '../goals/goal.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../notifications/push.service'
import { TelegramService } from '../channels/telegram/telegram.service'
import { ConnectorsService } from '../connectors/connectors.service'
import { WebSearchTool } from '../tools/connectors/web-search.tool'
import type { LLMProvider } from '@openagents/shared'
import {
  BriefingCard,
  BriefingRecord,
  BriefingSettings,
  BriefingStore,
  localClock,
} from './briefing.store'

const TICK_MS = 60 * 1000
/** A scheduled briefing may still fire up to this many minutes after its slot (e.g. after a restart). */
const CATCH_UP_MINUTES = 60

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

@Injectable()
export class BriefingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BriefingService.name)
  private timer?: NodeJS.Timeout
  private ticking = false
  private readonly inFlight = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly goals: GoalService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly telegram: TelegramService,
    private readonly store: BriefingStore,
    private readonly connectors: ConnectorsService,
    private readonly webSearch: WebSearchTool,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getSettings(userId: string) {
    return this.store.getSettings(userId)
  }

  updateSettings(userId: string, patch: Partial<BriefingSettings>) {
    return this.store.updateSettings(userId, patch)
  }

  async getLatest(userId: string): Promise<BriefingRecord | null> {
    const data = await this.store.load(userId)
    return data.history[0] ?? null
  }

  async getHistory(userId: string, limit = 30): Promise<BriefingRecord[]> {
    const data = await this.store.load(userId)
    return data.history.slice(0, Math.max(1, Math.min(60, limit)))
  }

  /** Compose and deliver a briefing now. */
  async runNow(userId: string): Promise<BriefingRecord> {
    return this.generateAndDeliver(userId, 'manual')
  }

  /** Back-compat: compose and deliver today's briefing for one user. */
  async sendBriefing(userId: string, _opts?: { force?: boolean }): Promise<boolean> {
    await this.generateAndDeliver(userId, 'manual')
    return true
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────

  async tick(): Promise<number> {
    if (this.ticking) return 0
    this.ticking = true
    let sent = 0
    try {
      const userIds = await this.store.listUserIds()
      for (const userId of userIds) {
        const data = await this.store.load(userId)
        const { settings } = data
        if (!settings.enabled) continue
        const { dateKey, hhmm } = localClock(settings.timezone)
        if (data.lastScheduledDateKey === dateKey) continue
        const delta = toMinutes(hhmm) - toMinutes(settings.time)
        if (delta < 0 || delta > CATCH_UP_MINUTES) continue
        await this.store.markScheduled(userId, dateKey)
        try {
          await this.generateAndDeliver(userId, 'scheduled')
          sent += 1
        } catch (error: any) {
          this.logger.warn(`Scheduled briefing failed for ${userId}: ${error?.message ?? error}`)
        }
      }
    } finally {
      this.ticking = false
    }
    return sent
  }

  // ── Generation ────────────────────────────────────────────────────────────

  private async generateAndDeliver(userId: string, trigger: 'scheduled' | 'manual'): Promise<BriefingRecord> {
    if (this.inFlight.has(userId)) throw new Error('A briefing is already being generated')
    this.inFlight.add(userId)
    try {
      const settings = await this.store.getSettings(userId)
      const cards = await this.collectCards(userId, settings)
      const summary = await this.summarize(userId, cards)
      const record: BriefingRecord = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        dateKey: localClock(settings.timezone).dateKey,
        trigger,
        summary,
        cards,
      }
      await this.store.addRecord(userId, record, trigger === 'scheduled')
      await this.deliver(userId, record)
      return record
    } finally {
      this.inFlight.delete(userId)
    }
  }

  private async collectCards(userId: string, settings: BriefingSettings): Promise<BriefingCard[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const s = settings.sections
    const cards: BriefingCard[] = []

    if (s.tasks) {
      const [goals, approvals, cronRuns] = await Promise.all([
        this.goals.listForUser(userId, 'active').catch(() => [] as any[]),
        this.prisma.approval.count({ where: { userId, status: 'pending' } }).catch(() => 0),
        this.prisma.cronRun.findMany({
          where: { createdAt: { gte: since }, job: { userId } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { status: true, summary: true, error: true },
        }).catch(() => [] as Array<{ status: string; summary: string | null; error: string | null }>),
      ])
      const items = [
        ...goals.map((g: any) => `${g.title} (${g.progress}%, ${g.priority})`),
        ...(approvals > 0 ? [`${approvals} pending approval${approvals === 1 ? '' : 's'}`] : []),
        ...cronRuns.map((r) => `Job ${r.status}: ${r.summary ?? r.error ?? 'no summary'}`),
      ]
      cards.push({ section: 'tasks', title: 'Tasks & goals', items })
    }

    if (s.memory) {
      const [loops, events] = await Promise.all([
        this.prisma.memoryFact.findMany({
          where: { userId, entity: 'open_loop' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }).catch(() => [] as any[]),
        this.prisma.memoryEvent.findMany({
          where: { userId, createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { summary: true, kind: true },
        }).catch(() => [] as Array<{ summary: string; kind: string }>),
      ])
      cards.push({
        section: 'memory',
        title: 'Memory & open loops',
        items: [...loops.map((f: any) => this.loopText(f.value)), ...events.map((e) => e.summary)],
      })
    }

    const [email, calendar, news] = await Promise.all([
      s.email ? this.emailItems(userId) : Promise.resolve(null),
      s.calendar ? this.calendarItems(userId, settings.timezone) : Promise.resolve(null),
      s.news ? this.newsItems(userId, settings.newsTopics) : Promise.resolve(null),
    ])
    if (email) cards.push({ section: 'email', title: 'Email', items: email })
    if (calendar) cards.push({ section: 'calendar', title: 'Calendar', items: calendar })
    if (news) cards.push({ section: 'news', title: 'News', items: news })

    return cards
  }

  private async summarize(userId: string, cards: BriefingCard[]): Promise<string> {
    const context = cards
      .filter((c) => c.items.length)
      .map((c) => `${c.title}:\n${c.items.map((i) => `- ${i}`).join('\n')}`)
      .join('\n\n')
    if (!context) return 'Nothing urgent today. Enjoy a clear day.'

    const settings = await this.prisma.userSettings.findUnique({ where: { userId } }).catch(() => null)
    const provider = (settings?.preferredProvider ?? 'ollama') as LLMProvider
    try {
      const response = await this.llm.complete(
        [{ role: 'user', content: `Write my morning briefing from the material below. 3-6 short bullets, most urgent first, end with ONE suggested next action. Plain text, no markdown headers.\n\n${context.slice(0, 8000)}` }],
        [],
        'You are a concise chief-of-staff writing a daily briefing for your principal.',
        provider,
        undefined,
        undefined,
        settings?.preferredModel ?? undefined,
      )
      const text = (response.content ?? '').trim()
      if (text) return text
    } catch {
      // fall through
    }
    return context.slice(0, 1500)
  }

  private async deliver(userId: string, record: BriefingRecord) {
    const title = 'Daily briefing ready'
    const body = record.summary.slice(0, 300)
    await this.notifications.create(userId, title, body, 'info').catch(() => undefined)
    await this.push.sendToUser(userId, { title: `OpenAgents — ${title}`, body: body.slice(0, 160), url: '/briefing' })
      .catch(() => undefined)
    await this.telegram.deliver(userId, `Daily briefing\n\n${record.summary.slice(0, 3500)}`).catch(() => false)
    this.logger.log(`Briefing ${record.id} delivered for ${userId} (${record.trigger}).`)
  }

  private async isConnected(userId: string, connectorId: string): Promise<boolean> {
    try {
      return (await this.connectors.getConnection(userId, connectorId)).connected
    } catch {
      return false
    }
  }

  /** Unread/important Gmail messages from the last 24h (fetchGoogle handles token refresh). */
  private async emailItems(userId: string): Promise<string[]> {
    if (!(await this.isConnected(userId, 'google_gmail'))) {
      return ['Connect a source: link Gmail in Connectors to see email here.']
    }
    try {
      const q = encodeURIComponent('newer_than:1d (is:unread OR is:important) -in:chats')
      const list = await this.connectors.fetchGoogle(
        userId,
        'google_gmail',
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=${q}`,
      )
      const data = (await list.json()) as { messages?: Array<{ id: string }> }
      const ids = (data.messages ?? []).slice(0, 8).map((m) => m.id)
      const items = await Promise.all(ids.map(async (id) => {
        try {
          const res = await this.connectors.fetchGoogle(
            userId,
            'google_gmail',
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          )
          const msg = (await res.json()) as { snippet?: string; payload?: { headers?: Array<{ name: string; value: string }> } }
          const header = (n: string) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? ''
          const from = header('from').replace(/\s*<[^>]+>/, '').replace(/"/g, '') || 'Unknown sender'
          const subject = header('subject') || '(no subject)'
          const snippet = (msg.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 140)
          return `"${subject}" from ${from}${snippet ? ` - ${snippet}` : ''}`
        } catch {
          return null
        }
      }))
      return items.filter((i): i is string => Boolean(i))
    } catch (error: any) {
      this.logger.warn(`Briefing email fetch failed for ${userId}: ${error?.message ?? error}`)
      return ['Could not load email right now.']
    }
  }

  /** Today's Google Calendar events in the user's timezone. */
  private async calendarItems(userId: string, timezone: string): Promise<string[]> {
    if (!(await this.isConnected(userId, 'google_calendar'))) {
      return ['Connect a source: link Google Calendar in Connectors to see events here.']
    }
    try {
      const { start, end } = dayBounds(timezone)
      const params = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '15',
        timeZone: timezone,
      })
      const res = await this.connectors.fetchGoogle(
        userId,
        'google_calendar',
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      )
      const data = (await res.json()) as {
        items?: Array<{ summary?: string; location?: string; start?: { dateTime?: string; date?: string } }>
      }
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
      return (data.items ?? []).map((e) => {
        const when = e.start?.dateTime ? fmt.format(new Date(e.start.dateTime)) : 'All day'
        return `${when} ${e.summary ?? '(untitled)'}${e.location ? ` @ ${e.location}` : ''}`
      })
    } catch (error: any) {
      this.logger.warn(`Briefing calendar fetch failed for ${userId}: ${error?.message ?? error}`)
      return ['Could not load calendar right now.']
    }
  }

  /** Headlines via the web_search tool for the user's topics. */
  private async newsItems(userId: string, topics?: string[]): Promise<string[]> {
    const list = (topics?.length ? topics : ['AI', 'technology']).slice(0, 5)
    const results = await Promise.all(list.map(async (topic) => {
      try {
        const r = await this.webSearch.search({ query: `${topic} news today`, count: 3 }, userId)
        if (!r.success) return [] as string[]
        const out = r.output as { results?: Array<{ title?: string; url?: string }> }
        return (out.results ?? [])
          .filter((x) => x.title)
          .map((x) => `[${topic}] ${x.title}${x.url ? ` (${x.url})` : ''}`)
      } catch {
        return [] as string[]
      }
    }))
    return results.flat().slice(0, 12)
  }

  private loopText(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as { text?: string; dueDate?: string }
      const due = parsed.dueDate ? ` (due ${parsed.dueDate.slice(0, 10)})` : ''
      return `${parsed.text ?? raw}${due}`
    } catch {
      return raw
    }
  }
}

/** Start/end of the current local day in a timezone, as UTC instants. */
function dayBounds(timezone: string) {
  const { dateKey } = localClock(timezone)
  const noonUtc = new Date(`${dateKey}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(noonUtc)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  let offsetMin = h * 60 + m - 12 * 60
  if (offsetMin > 14 * 60) offsetMin -= 24 * 60
  if (offsetMin < -14 * 60) offsetMin += 24 * 60
  const start = new Date(Date.parse(`${dateKey}T00:00:00Z`) - offsetMin * 60_000)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}
