import { promises as fs } from 'fs'
import * as path from 'path'

/** Tiny per-user JSON file store with serialized writes (one queue per file). */
export class UserJsonStore<T> {
  private queues = new Map<string, Promise<unknown>>()

  constructor(
    private readonly envDir: string,
    private readonly defaultSub: string,
    private readonly fallback: () => T,
  ) {}

  private dir() {
    return path.resolve(process.env[this.envDir] ?? path.join(process.cwd(), 'data', this.defaultSub))
  }

  private file(id: string) {
    return path.join(this.dir(), `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
  }

  async read(id: string): Promise<T> {
    try {
      return { ...this.fallback(), ...JSON.parse(await fs.readFile(this.file(id), 'utf8')) }
    } catch {
      return this.fallback()
    }
  }

  /** Read-modify-write under a per-file lock. */
  update<R>(id: string, fn: (data: T) => R | Promise<R>): Promise<R> {
    const key = this.file(id)
    const prev = this.queues.get(key) ?? Promise.resolve()
    const run = prev.catch(() => undefined).then(async () => {
      const data = await this.read(id)
      const result = await fn(data)
      await fs.mkdir(this.dir(), { recursive: true })
      const tmp = `${key}.${process.pid}.tmp`
      await fs.writeFile(tmp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
      await fs.rename(tmp, key)
      return result
    })
    this.queues.set(key, run)
    return run
  }

  async listIds(): Promise<string[]> {
    try {
      return (await fs.readdir(this.dir())).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    } catch {
      return []
    }
  }
}
