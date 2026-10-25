import { Injectable, Logger } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'

export type BriefingSectionKey = 'email' | 'calendar' | 'tasks' | 'news' | 'memory' | 'learning' | 'content_pipeline'
export const BRIEFING_SECTIONS: BriefingSectionKey[] = ['email', 'calendar', 'tasks', 'news', 'memory', 'learning', 'content_pipeline']

export interface BriefingSettings {
  enabled: boolean
  /** Local time HH:mm */
  time: string
  /** IANA timezone, e.g. America/New_York */
  timezone: string
  sections: Record<BriefingSectionKey, boolean>
  /** Topics searched for the news card. */
  newsTopics?: string[]
}

export interface BriefingCard {
  section: BriefingSectionKey
  title: string
  items: string[]
}

export interface BriefingRecord {
  id: string
  createdAt: string
  /** Local date key (YYYY-MM-DD) in the user's timezone */
  dateKey: string
  trigger: 'scheduled' | 'manual'
  summary: string
  cards: BriefingCard[]
  /** LLM-generated concrete plan for today (the "act" half of the briefing). */
  plan?: string
}

interface UserBriefingFile {
  settings: BriefingSettings
  history: BriefingRecord[]
  lastScheduledDateKey?: string
}

const MAX_HISTORY = 60
const KIND = 'briefing'

export function defaultBriefingSettings(): BriefingSettings {
  return {
    enabled: false,
    time: '08:00',
    timezone: 'UTC',
    sections: { email: true, calendar: true, tasks: true, news: false, memory: true, learning: true, content_pipeline: true },
    newsTopics: ['AI', 'technology'],
  }
}

@Injectable()
export class BriefingStore {
  private readonly logger = new Logger(BriefingStore.name)

  constructor(private documents: DocumentStore) {}

  async load(userId: string): Promise<UserBriefingFile> {
    const data = await this.documents.read<UserBriefingFile>(userId, KIND, () => ({
      settings: defaultBriefingSettings(),
      history: [],
    }))
    // Sanitise on read — the stored blob may predate a settings change.
    return {
      settings: normalizeSettings(data.settings),
      history: Array.isArray(data.history) ? data.history : [],
      lastScheduledDateKey: data.lastScheduledDateKey,
    }
  }

  async save(userId: string, data: UserBriefingFile) {
    await this.documents.write(userId, KIND, data)
  }

  async getSettings(userId: string) {
    return (await this.load(userId)).settings
  }

  async updateSettings(userId: string, patch: Partial<BriefingSettings>) {
    const data = await this.load(userId)
    data.settings = normalizeSettings({
      ...data.settings,
      ...patch,
      sections: { ...data.settings.sections, ...(patch.sections ?? {}) },
    })
    await this.save(userId, data)
    return data.settings
  }

  async addRecord(userId: string, record: BriefingRecord, scheduled = false) {
    const data = await this.load(userId)
    data.history = [record, ...data.history].slice(0, MAX_HISTORY)
    if (scheduled) data.lastScheduledDateKey = record.dateKey
    await this.save(userId, data)
  }

  async markScheduled(userId: string, dateKey: string) {
    const data = await this.load(userId)
    data.lastScheduledDateKey = dateKey
    await this.save(userId, data)
  }

  /** Users with persisted briefing data (only these can have scheduling enabled). */
  async listUserIds(): Promise<string[]> {
    return this.documents.listUserIds(KIND)
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function normalizeSettings(input?: Partial<BriefingSettings>): BriefingSettings {
  const base = defaultBriefingSettings()
  const time = typeof input?.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) ? input.time : base.time
  const timezone = typeof input?.timezone === 'string' && isValidTimezone(input.timezone) ? input.timezone : base.timezone
  const sections = { ...base.sections }
  for (const key of BRIEFING_SECTIONS) {
    const v = input?.sections?.[key]
    if (typeof v === 'boolean') sections[key] = v
  }
  const newsTopics = Array.isArray(input?.newsTopics)
    ? input!.newsTopics.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 80)).filter(Boolean).slice(0, 10)
    : base.newsTopics!
  return { enabled: Boolean(input?.enabled ?? base.enabled), time, timezone, sections, newsTopics }
}

/** Returns local { dateKey: YYYY-MM-DD, hhmm: HH:mm } for a timezone. */
export function localClock(timezone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, hhmm: `${get('hour')}:${get('minute')}` }
}
