import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

/** Only these tools may ever be exposed on a public agent. */
export const SAFE_PUBLIC_TOOLS = ['web_search', 'library_search'] as const
export type SafePublicTool = (typeof SAFE_PUBLIC_TOOLS)[number]

export interface PublicAgentUsage {
  /** YYYY-MM-DD (UTC) of the counters below */
  dayKey: string
  messagesToday: number
  /** YYYY-MM (UTC) of the monthly cost counter */
  monthKey: string
  costMonthUsd: number
  totalMessages: number
  totalCostUsd: number
  uniqueVisitorsToday: string[]
  /** Last 30 days: { day, messages } */
  daily: Array<{ day: string; messages: number; costUsd: number }>
  blocked: { rateLimited: number; origin: number; cap: number; guard: number }
}

export interface PublicAgent {
  id: string
  ownerId: string
  slug: string
  name: string
  avatar: string
  description: string
  greeting: string
  systemPrompt: string
  tools: SafePublicTool[]
  /** Library document ids the agent may search (owner's docs only) */
  libraryDocumentIds: string[]
  published: boolean
  allowedOrigins: string[]
  dailyMessageCap: number
  monthlyCostCapUsd: number
  createdAt: string
  updatedAt: string
  usage: PublicAgentUsage
}

interface OwnerFile {
  agents: PublicAgent[]
}

export function emptyUsage(): PublicAgentUsage {
  const now = new Date().toISOString()
  return {
    dayKey: now.slice(0, 10),
    messagesToday: 0,
    monthKey: now.slice(0, 7),
    costMonthUsd: 0,
    totalMessages: 0,
    totalCostUsd: 0,
    uniqueVisitorsToday: [],
    daily: [],
    blocked: { rateLimited: 0, origin: 0, cap: 0, guard: 0 },
  }
}

@Injectable()
export class PublicAgentsStore {
  private readonly logger = new Logger(PublicAgentsStore.name)
  private readonly dir = path.resolve(
    process.env.PUBLIC_AGENTS_DATA_DIR ?? path.join(process.cwd(), 'data', 'public-agents'),
  )
  private readonly cache = new Map<string, OwnerFile>()
  private slugIndex: Record<string, string> | null = null

  private safe(userId: string) {
    return userId.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  private fileFor(userId: string) {
    return path.join(this.dir, `${this.safe(userId)}.json`)
  }

  private get indexFile() {
    return path.join(this.dir, '_slugs.json')
  }

  async load(userId: string): Promise<OwnerFile> {
    const cached = this.cache.get(userId)
    if (cached) return cached
    let data: OwnerFile = { agents: [] }
    try {
      const parsed = JSON.parse(await fs.readFile(this.fileFor(userId), 'utf8')) as Partial<OwnerFile>
      data = { agents: Array.isArray(parsed.agents) ? parsed.agents : [] }
    } catch {
      // missing -> empty
    }
    this.cache.set(userId, data)
    return data
  }

  async save(userId: string, data: OwnerFile) {
    this.cache.set(userId, data)
    try {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(this.fileFor(userId), JSON.stringify(data, null, 2), 'utf8')
    } catch (err) {
      this.logger.warn(`Failed to persist public agents: ${(err as Error).message}`)
    }
  }

  async getIndex(): Promise<Record<string, string>> {
    if (this.slugIndex) return this.slugIndex
    try {
      this.slugIndex = JSON.parse(await fs.readFile(this.indexFile, 'utf8')) as Record<string, string>
    } catch {
      this.slugIndex = {}
    }
    return this.slugIndex
  }

  async setSlug(slug: string, ownerId: string | null) {
    const index = await this.getIndex()
    if (ownerId) index[slug] = ownerId
    else delete index[slug]
    try {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2), 'utf8')
    } catch (err) {
      this.logger.warn(`Failed to persist slug index: ${(err as Error).message}`)
    }
  }

  async findBySlug(slug: string): Promise<PublicAgent | null> {
    const ownerId = (await this.getIndex())[slug]
    if (!ownerId) return null
    const data = await this.load(ownerId)
    return data.agents.find((a) => a.slug === slug) ?? null
  }
}
