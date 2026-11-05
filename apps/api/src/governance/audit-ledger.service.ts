import { Injectable, Logger } from '@nestjs/common'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { governanceFile, serialize } from './governance.store'

export interface LedgerEntry {
  seq: number
  ts: string
  action: string
  actor: string
  resource: string
  data: Record<string, unknown>
  prevHash: string
  hash: string
  /** HMAC-SHA256 of `hash` with the server secret (absent when no secret configured). */
  sig?: string
}

export interface LedgerVerification {
  ok: boolean
  total: number
  signed: boolean
  headHash: string
  brokenAt?: number
  reason?: string
}

const GENESIS = '0'.repeat(64)
const SENSITIVE_KEY = /token|secret|password|passwd|authorization|api[_-]?key|credential|cookie/i

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[depth]'
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)
    }
    return out
  }
  return value
}

@Injectable()
export class AuditLedgerService {
  private readonly logger = new Logger(AuditLedgerService.name)

  private secret(): string | null {
    const s = (process.env.AUDIT_LEDGER_SECRET || process.env.JWT_SECRET || '').trim()
    return s || null
  }

  private sign(hash: string): string | undefined {
    const s = this.secret()
    return s ? createHmac('sha256', s).update(hash).digest('hex') : undefined
  }

  private computeHash(e: Omit<LedgerEntry, 'hash' | 'sig'>): string {
    return createHash('sha256')
      .update(canonical({ seq: e.seq, ts: e.ts, action: e.action, actor: e.actor, resource: e.resource, data: e.data, prevHash: e.prevHash }))
      .digest('hex')
  }

  private file(userId: string) {
    return governanceFile(userId, 'audit-ledger.jsonl')
  }

  private async readAll(userId: string): Promise<LedgerEntry[]> {
    try {
      const raw = await fs.readFile(this.file(userId), 'utf8')
      const entries: LedgerEntry[] = []
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          entries.push(JSON.parse(line) as LedgerEntry)
        } catch {
          entries.push({ seq: -1, ts: '', action: '__corrupt__', actor: '', resource: '', data: {}, prevHash: '', hash: '' })
        }
      }
      return entries
    } catch {
      return []
    }
  }

  /** Appends a hash-chained entry. Never throws (auditing must not break the caller). */
  async append(
    userId: string,
    action: string,
    resource: string,
    data: Record<string, unknown> = {},
    actor = 'agent',
  ): Promise<LedgerEntry | null> {
    try {
      return await serialize(`ledger:${userId}`, async () => {
        const file = this.file(userId)
        const entries = await this.readAll(userId)
        const last = entries[entries.length - 1]
        const base = {
          seq: last ? last.seq + 1 : 0,
          ts: new Date().toISOString(),
          action: String(action).slice(0, 120),
          actor: String(actor).slice(0, 120),
          resource: String(resource).slice(0, 240),
          data: JSON.parse(JSON.stringify(redact(data) ?? {})) as Record<string, unknown>,
          prevHash: last ? last.hash : GENESIS,
        }
        const hash = this.computeHash(base)
        const entry: LedgerEntry = { ...base, hash, sig: this.sign(hash) }
        await fs.mkdir(file.replace(/[\\/][^\\/]+$/, ''), { recursive: true })
        await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8')
        return entry
      })
    } catch (err) {
      this.logger.warn(`ledger append failed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  verifyEntries(entries: LedgerEntry[]): LedgerVerification {
    const secret = this.secret()
    let prev = GENESIS
    const signed = entries.some((e) => !!e.sig)
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const fail = (reason: string): LedgerVerification => ({
        ok: false, total: entries.length, signed, headHash: prev, brokenAt: e.seq >= 0 ? e.seq : i, reason,
      })
      if (e.seq !== i) return fail(`Sequence gap or corrupt record at position ${i}`)
      if (e.prevHash !== prev) return fail('prevHash does not match previous entry (entry removed or reordered)')
      if (this.computeHash(e) !== e.hash) return fail('Entry contents do not match their hash (entry modified)')
      if (secret && e.sig) {
        const expected = Buffer.from(createHmac('sha256', secret).update(e.hash).digest('hex'))
        const got = Buffer.from(String(e.sig))
        if (expected.length !== got.length || !timingSafeEqual(expected, got)) return fail('HMAC signature invalid')
      } else if (secret && signed && !e.sig) {
        return fail('Missing HMAC signature')
      }
      prev = e.hash
    }
    return { ok: true, total: entries.length, signed, headHash: prev }
  }

  async verify(userId: string): Promise<LedgerVerification> {
    return this.verifyEntries(await this.readAll(userId))
  }

  async list(userId: string, limit = 100, offset = 0) {
    const all = await this.readAll(userId)
    const slice = all.slice().reverse().slice(offset, offset + Math.min(Math.max(limit, 1), 500))
    return { total: all.length, entries: slice }
  }

  async export(userId: string) {
    const entries = await this.readAll(userId)
    return {
      exportedAt: new Date().toISOString(),
      userId,
      algorithm: 'sha256-chain',
      signed: entries.some((e) => !!e.sig),
      verification: this.verifyEntries(entries),
      entries,
    }
  }

  /**
   * Non-destructive demo: copies the real chain in memory, tampers with one entry
   * and shows the verifier catching it. The stored ledger is never modified.
   */
  async tamperDemo(userId: string) {
    const entries = JSON.parse(JSON.stringify(await this.readAll(userId))) as LedgerEntry[]
    if (!entries.length) return { available: false as const, message: 'Ledger is empty — perform an action first.' }
    const before = this.verifyEntries(entries)
    const idx = Math.floor(entries.length / 2)
    const original = entries[idx].action
    entries[idx].action = `${original} (tampered)`
    const after = this.verifyEntries(entries)
    return { available: true as const, tamperedSeq: idx, original, before, after }
  }
}
