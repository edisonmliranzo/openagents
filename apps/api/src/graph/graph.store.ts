import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

export type GraphEntityType = 'person' | 'project' | 'company' | 'topic' | 'place'
export const GRAPH_ENTITY_TYPES: GraphEntityType[] = ['person', 'project', 'company', 'topic', 'place']

export interface GraphMention {
  source: 'memory' | 'conversation' | 'briefing'
  sourceId: string
  snippet: string
  at: string
}

export interface GraphEntity {
  id: string
  name: string
  type: GraphEntityType
  summary: string
  mentionCount: number
  mentions: GraphMention[]
  createdAt: string
  updatedAt: string
}

export interface GraphRelation {
  id: string
  fromId: string
  toId: string
  relation: string
  weight: number
}

export interface UserGraphFile {
  entities: GraphEntity[]
  relations: GraphRelation[]
  cursor: { memoriesAt?: string; messagesAt?: string; briefingsAt?: string }
  lastRunAt?: string
  lastNightlyDateKey?: string
}

const MAX_MENTIONS_PER_ENTITY = 25

@Injectable()
export class GraphStore {
  private readonly logger = new Logger(GraphStore.name)
  private readonly dir = path.resolve(process.env.GRAPH_DATA_DIR ?? path.join(process.cwd(), 'data', 'graph'))
  private readonly cache = new Map<string, UserGraphFile>()

  private fileFor(userId: string) {
    return path.join(this.dir, `${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
  }

  empty(): UserGraphFile {
    return { entities: [], relations: [], cursor: {} }
  }

  async load(userId: string): Promise<UserGraphFile> {
    const cached = this.cache.get(userId)
    if (cached) return cached
    let data = this.empty()
    try {
      const parsed = JSON.parse(await fs.readFile(this.fileFor(userId), 'utf8')) as Partial<UserGraphFile>
      data = {
        entities: Array.isArray(parsed.entities) ? parsed.entities : [],
        relations: Array.isArray(parsed.relations) ? parsed.relations : [],
        cursor: parsed.cursor ?? {},
        lastRunAt: parsed.lastRunAt,
        lastNightlyDateKey: parsed.lastNightlyDateKey,
      }
    } catch {
      // missing file -> empty graph
    }
    this.cache.set(userId, data)
    return data
  }

  async save(userId: string, data: UserGraphFile) {
    for (const e of data.entities) e.mentions = e.mentions.slice(-MAX_MENTIONS_PER_ENTITY)
    this.cache.set(userId, data)
    try {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(this.fileFor(userId), JSON.stringify(data, null, 2), 'utf8')
    } catch (error: any) {
      this.logger.warn(`Failed to persist graph for ${userId}: ${error?.message ?? error}`)
    }
  }

  async remove(userId: string) {
    this.cache.delete(userId)
    await fs.rm(this.fileFor(userId), { force: true }).catch(() => undefined)
  }

  async listUserIds(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dir)
      return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    } catch {
      return []
    }
  }
}
