import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

export type PhoneCallStatus =
  | 'pending_approval'
  | 'rejected'
  | 'dialing'
  | 'in_progress'
  | 'completed'
  | 'failed'

export interface PhoneTurn {
  role: 'caller' | 'agent'
  text: string
  at: string
}

export interface PhoneCallRecord {
  id: string
  userId: string
  direction: 'outbound' | 'inbound'
  to: string
  from: string
  goal: string
  status: PhoneCallStatus
  twilioSid?: string
  transcript: PhoneTurn[]
  summary?: string
  error?: string
  createdAt: string
  updatedAt: string
  approvedAt?: string
  endedAt?: string
}

const MAX_CALLS = 200
const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')

/** JSON-file store: data/phone/<safeUserId>.json plus an index callId -> userId for webhooks. */
@Injectable()
export class PhoneStore {
  private readonly logger = new Logger(PhoneStore.name)
  private readonly dir = path.resolve(process.env.PHONE_DATA_DIR ?? path.join(process.cwd(), 'data', 'phone'))
  private readonly cache = new Map<string, PhoneCallRecord[]>()
  private index: Record<string, string> | null = null
  private queue: Promise<unknown> = Promise.resolve()

  private fileFor(userId: string) {
    return path.join(this.dir, `${safe(userId)}.json`)
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => undefined)
    return next
  }

  private async load(userId: string): Promise<PhoneCallRecord[]> {
    const hit = this.cache.get(userId)
    if (hit) return hit
    let calls: PhoneCallRecord[] = []
    try {
      calls = JSON.parse(await fs.readFile(this.fileFor(userId), 'utf8'))?.calls ?? []
    } catch {
      calls = []
    }
    this.cache.set(userId, calls)
    return calls
  }

  private async loadIndex(): Promise<Record<string, string>> {
    if (this.index) return this.index
    try {
      this.index = JSON.parse(await fs.readFile(path.join(this.dir, '_index.json'), 'utf8')) ?? {}
    } catch {
      this.index = {}
    }
    return this.index!
  }

  private async persist(userId: string, calls: PhoneCallRecord[]) {
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.fileFor(userId), JSON.stringify({ calls }, null, 2), 'utf8')
    if (this.index) await fs.writeFile(path.join(this.dir, '_index.json'), JSON.stringify(this.index), 'utf8')
  }

  async list(userId: string) {
    return [...(await this.load(userId))].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async get(userId: string, id: string) {
    return (await this.load(userId)).find((c) => c.id === id) ?? null
  }

  async getById(id: string) {
    const userId = (await this.loadIndex())[id]
    return userId ? this.get(userId, id) : null
  }

  save(record: PhoneCallRecord) {
    return this.serialize(async () => {
      const calls = await this.load(record.userId)
      const idx = calls.findIndex((c) => c.id === record.id)
      record.updatedAt = new Date().toISOString()
      if (idx >= 0) calls[idx] = record
      else calls.unshift(record)
      const index = await this.loadIndex()
      index[record.id] = record.userId
      if (calls.length > MAX_CALLS) {
        for (const dropped of calls.splice(MAX_CALLS)) delete index[dropped.id]
      }
      await this.persist(record.userId, calls).catch((e) => this.logger.warn(`persist failed: ${e?.message}`))
      return record
    })
  }
}
