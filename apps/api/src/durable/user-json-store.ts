import fs from 'node:fs'
import path from 'node:path'

/**
 * Tiny per-user JSON file store (atomic write via tmp+rename). Data lives under
 * <cwd>/data/<namespace>/<userId>.json, matching the other file-backed modules.
 * Single-process synchronous read-modify-write keeps mutations race-free.
 */
export class UserJsonStore<T> {
  private readonly dir: string
  private readonly cache = new Map<string, T[]>()

  constructor(namespace: string, private readonly maxItems = 500) {
    this.dir = path.resolve(process.env.OPENAGENTS_DATA_DIR ?? path.join(process.cwd(), 'data'), namespace)
  }

  private keyOf(userId: string) {
    return userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'anon'
  }

  private fileFor(userId: string) {
    return path.join(this.dir, `${this.keyOf(userId)}.json`)
  }

  load(userId: string): T[] {
    const hit = this.cache.get(this.keyOf(userId))
    if (hit) return hit
    let items: T[] = []
    try {
      const raw = JSON.parse(fs.readFileSync(this.fileFor(userId), 'utf8'))
      if (Array.isArray(raw)) items = raw
    } catch {
      items = []
    }
    this.cache.set(this.keyOf(userId), items)
    return items
  }

  save(userId: string, items: T[]) {
    const trimmed = items.length > this.maxItems ? items.slice(items.length - this.maxItems) : items
    this.cache.set(this.keyOf(userId), trimmed)
    fs.mkdirSync(this.dir, { recursive: true })
    const file = this.fileFor(userId)
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(trimmed))
    fs.renameSync(tmp, file)
  }

  /** Files present on disk as [userId-safe-name, items] — used by boot-time recovery scans. */
  listUserKeys(): string[] {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
    } catch {
      return []
    }
  }
}
