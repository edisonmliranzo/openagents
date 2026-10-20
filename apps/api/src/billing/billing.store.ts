import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { PlanId, UsageMetric } from './billing.plans'

export interface UserBillingFile {
  plan: PlanId
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  subscriptionStatus?: string
  currentPeriodEnd?: string
  /** dateKey (YYYY-MM-DD UTC) -> metric -> count; monthly metrics use YYYY-MM keys. */
  usage: Record<string, Partial<Record<UsageMetric, number>>>
  updatedAt: string
}

const MAX_USAGE_KEYS = 62

export function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** Small JSON-file helper shared by billing + marketplace stores. */
export class JsonFile<T> {
  private cache?: T
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly file: string, private readonly fallback: () => T) {}

  async read(): Promise<T> {
    if (this.cache) return this.cache
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, 'utf8')) as T
    } catch {
      this.cache = this.fallback()
    }
    return this.cache
  }

  async write(value: T) {
    this.cache = value
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
      await fs.rename(tmp, this.file)
    })
    await this.writing
  }
}

@Injectable()
export class BillingStore {
  private readonly logger = new Logger(BillingStore.name)
  private readonly dir = path.resolve(process.env.BILLING_DATA_DIR ?? path.join(process.cwd(), 'data', 'billing'))
  private readonly files = new Map<string, JsonFile<UserBillingFile>>()
  private readonly index = new JsonFile<Record<string, string>>(
    path.join(this.dir, '_customers.json'),
    () => ({}),
  )

  private fileFor(userId: string) {
    let f = this.files.get(userId)
    if (!f) {
      f = new JsonFile<UserBillingFile>(path.join(this.dir, `${safeId(userId)}.json`), () => ({
        plan: 'free',
        usage: {},
        updatedAt: new Date().toISOString(),
      }))
      this.files.set(userId, f)
    }
    return f
  }

  get(userId: string) {
    return this.fileFor(userId).read()
  }

  async update(userId: string, mutate: (rec: UserBillingFile) => void) {
    const f = this.fileFor(userId)
    const rec = await f.read()
    mutate(rec)
    const keys = Object.keys(rec.usage).sort()
    while (keys.length > MAX_USAGE_KEYS) delete rec.usage[keys.shift()!]
    rec.updatedAt = new Date().toISOString()
    await f.write(rec)
    return rec
  }

  async linkCustomer(customerId: string, userId: string) {
    const idx = await this.index.read()
    idx[customerId] = userId
    await this.index.write(idx)
  }

  async userForCustomer(customerId: string) {
    return (await this.index.read())[customerId]
  }
}
