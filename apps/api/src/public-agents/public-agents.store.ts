import { Injectable, Logger } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'

const KIND = 'public_agents'

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

  constructor(private documents: DocumentStore) {}

  async load(userId: string): Promise<OwnerFile> {
    const parsed = await this.documents.read<Partial<OwnerFile>>(userId, KIND, () => ({}))
    return { agents: Array.isArray(parsed.agents) ? parsed.agents : [] }
  }

  async save(userId: string, data: OwnerFile) {
    await this.documents.write(userId, KIND, data)
  }

  /** slug -> ownerId */
  async getIndex(): Promise<Record<string, string>> {
    return this.documents.readGlobal<Record<string, string>>('slug_index', () => ({}))
  }

  async setSlug(slug: string, ownerId: string | null) {
    const index = await this.getIndex()
    if (ownerId) index[slug] = ownerId
    else delete index[slug]
    await this.documents.writeGlobal('slug_index', index)
  }

  async findBySlug(slug: string): Promise<PublicAgent | null> {
    const ownerId = (await this.getIndex())[slug]
    if (!ownerId) return null
    const data = await this.load(ownerId)
    return data.agents.find((a) => a.slug === slug) ?? null
  }
}
