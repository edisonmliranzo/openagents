import { Injectable, Logger } from '@nestjs/common'
import { DocumentStore } from '../prisma/document-store.service'

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
const KIND = 'graph'

@Injectable()
export class GraphStore {
  private readonly logger = new Logger(GraphStore.name)

  constructor(private documents: DocumentStore) {}

  empty(): UserGraphFile {
    return { entities: [], relations: [], cursor: {} }
  }

  async load(userId: string): Promise<UserGraphFile> {
    return this.documents.read<UserGraphFile>(userId, KIND, () => this.empty())
  }

  async save(userId: string, data: UserGraphFile) {
    for (const e of data.entities) e.mentions = e.mentions.slice(-MAX_MENTIONS_PER_ENTITY)
    await this.documents.write(userId, KIND, data)
  }

  async remove(userId: string) {
    await this.documents.remove(userId, KIND)
  }

  async listUserIds(): Promise<string[]> {
    return this.documents.listUserIds(KIND)
  }
}
