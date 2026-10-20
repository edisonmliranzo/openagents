import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

export type MomentKind = 'meeting_soon' | 'unanswered_email' | 'calendar_conflict' | 'goal_stalled' | 'watch_hit'
export const MOMENT_KINDS: MomentKind[] = ['meeting_soon', 'unanswered_email', 'calendar_conflict', 'goal_stalled', 'watch_hit']
export type MomentStatus = 'active' | 'snoozed' | 'dismissed' | 'acted'

export interface MomentAction {
  id: string
  label: string
  /** In-app route to open when the user acts. */
  href?: string
}

export interface Moment {
  id: string
  /** Dedupe key, e.g. meeting:<eventId> */
  key: string
  kind: MomentKind
  title: string
  body: string
  context?: string[]
  actions: MomentAction[]
  status: MomentStatus
  snoozedUntil?: string
  delivered: boolean
  deliveredAt?: string
  actedActionId?: string
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

export interface MomentSettings {
  enabled: boolean
  timezone: string
  quietHours: { enabled: boolean; start: string; end: string }
  maxPerDay: number
  kinds: Record<MomentKind, boolean>
}

export interface MomentsFile {
  settings: MomentSettings
  moments: Moment[]
  seenKeys: string[]
  lastRunAt?: string
}

export function defaultMomentSettings(): MomentSettings {
  return {
    enabled: true,
    timezone: 'UTC',
    quietHours: { enabled: true, start: '22:00', end: '07:00' },
    maxPerDay: 8,
    kinds: { meeting_soon: true, unanswered_email: true, calendar_conflict: true, goal_stalled: true, watch_hit: true },
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function validTz(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function normalizeMomentSettings(input?: Partial<MomentSettings>): MomentSettings {
  const base = defaultMomentSettings()
  const qh = input?.quietHours
  const kinds = { ...base.kinds }
  for (const k of MOMENT_KINDS) if (typeof input?.kinds?.[k] === 'boolean') kinds[k] = input.kinds[k]
  const max = Number(input?.maxPerDay)
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : base.enabled,
    timezone: typeof input?.timezone === 'string' && validTz(input.timezone) ? input.timezone : base.timezone,
    quietHours: {
      enabled: typeof qh?.enabled === 'boolean' ? qh.enabled : base.quietHours.enabled,
      start: typeof qh?.start === 'string' && HHMM.test(qh.start) ? qh.start : base.quietHours.start,
      end: typeof qh?.end === 'string' && HHMM.test(qh.end) ? qh.end : base.quietHours.end,
    },
    maxPerDay: Number.isFinite(max) ? Math.max(0, Math.min(50, Math.round(max))) : base.maxPerDay,
    kinds,
  }
}

@Injectable()
export class MomentsStore {
  private readonly logger = new Logger(MomentsStore.name)
  private readonly dir = path.resolve(process.env.MOMENTS_DATA_DIR ?? path.join(process.cwd(), 'data', 'moments'))
  private readonly cache = new Map<string, MomentsFile>()

  private safe(userId: string) {
    return userId.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  async load(userId: string): Promise<MomentsFile> {
    const cached = this.cache.get(userId)
    if (cached) return cached
    let data: MomentsFile = { settings: defaultMomentSettings(), moments: [], seenKeys: [] }
    let exists = false
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(this.dir, `${this.safe(userId)}.json`), 'utf8')) as Partial<MomentsFile>
      exists = true
      data = {
        settings: normalizeMomentSettings(parsed.settings),
        moments: Array.isArray(parsed.moments) ? parsed.moments : [],
        seenKeys: Array.isArray(parsed.seenKeys) ? parsed.seenKeys : [],
        lastRunAt: parsed.lastRunAt,
      }
    } catch {
      // defaults
    }
    this.cache.set(userId, data)
    // Persist on first access so the worker picks this user up.
    if (!exists) await this.save(userId, data)
    return data
  }

  async save(userId: string, data: MomentsFile) {
    data.moments = data.moments.slice(0, 300)
    data.seenKeys = data.seenKeys.slice(-2000)
    this.cache.set(userId, data)
    try {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(path.join(this.dir, `${this.safe(userId)}.json`), JSON.stringify(data, null, 2), 'utf8')
    } catch (error: any) {
      this.logger.warn(`Failed to persist moments for ${userId}: ${error?.message ?? error}`)
    }
  }

  /** Files are named by sanitized id; real ids are cuid-like so this round-trips. */
  async listUserIds(): Promise<string[]> {
    try {
      return (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    } catch {
      return []
    }
  }
}
