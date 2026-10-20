import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { LLMProvider } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { PrivacyService } from '../privacy/privacy.service'
import {
  GRAPH_ENTITY_TYPES,
  GraphEntity,
  GraphEntityType,
  GraphMention,
  GraphStore,
  UserGraphFile,
} from './graph.store'

const TICK_MS = 30 * 60 * 1000
const NIGHTLY_UTC_HOUR = 3
const BATCH_CHARS = 6000
const MAX_ITEMS_PER_RUN = 120

interface SourceItem {
  source: GraphMention['source']
  sourceId: string
  text: string
  at: Date
}

interface Extraction {
  entities?: Array<{ name?: string; type?: string; summary?: string }>
  relations?: Array<{ from?: string; to?: string; relation?: string }>
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

@Injectable()
export class GraphService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GraphService.name)
  private timer?: NodeJS.Timeout
  private ticking = false
  private readonly running = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly store: GraphStore,
    private readonly privacy: PrivacyService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.nightlyTick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async getGraph(userId: string, q?: string) {
    const data = await this.store.load(userId)
    const query = q ? norm(q) : ''
    const entities = query
      ? data.entities.filter((e) => norm(e.name).includes(query) || norm(e.summary).includes(query))
      : data.entities
    const ids = new Set(entities.map((e) => e.id))
    return {
      nodes: entities.map(({ mentions: _m, ...rest }) => rest),
      edges: data.relations.filter((r) => ids.has(r.fromId) && ids.has(r.toId)),
      lastRunAt: data.lastRunAt ?? null,
      running: this.running.has(userId),
    }
  }

  async getEntity(userId: string, id: string) {
    const data = await this.store.load(userId)
    const entity = data.entities.find((e) => e.id === id)
    if (!entity) throw new NotFoundException('Entity not found')
    const byId = new Map(data.entities.map((e) => [e.id, e]))
    const relations = data.relations
      .filter((r) => r.fromId === id || r.toId === id)
      .map((r) => {
        const otherId = r.fromId === id ? r.toId : r.fromId
        const other = byId.get(otherId)
        return {
          ...r,
          direction: r.fromId === id ? 'out' : 'in',
          other: other ? { id: other.id, name: other.name, type: other.type } : null,
        }
      })
    return { entity: { ...entity, mentions: [...entity.mentions].reverse() }, relations }
  }

  /** Incremental update by default; full=true wipes and rebuilds from scratch. */
  async rebuild(userId: string, full = false) {
    if (this.running.has(userId)) return { ok: false, reason: 'already_running' }
    this.running.add(userId)
    try {
      const data = full ? this.store.empty() : await this.store.load(userId)
      const items = await this.collectSources(userId, data)
      let processed = 0
      for (const batch of this.batches(items)) {
        const extraction = await this.extract(userId, batch)
        if (extraction) this.merge(data, batch, extraction)
        processed += batch.length
      }
      for (const item of items) this.advanceCursor(data, item)
      data.lastRunAt = new Date().toISOString()
      await this.store.save(userId, data)
      return { ok: true, processed, entities: data.entities.length, relations: data.relations.length }
    } finally {
      this.running.delete(userId)
    }
  }

  async clear(userId: string) {
    await this.store.remove(userId)
  }

  // ── Nightly job ───────────────────────────────────────────────────────────

  async nightlyTick() {
    if (this.ticking) return
    const now = new Date()
    if (now.getUTCHours() !== NIGHTLY_UTC_HOUR) return
    this.ticking = true
    const dateKey = now.toISOString().slice(0, 10)
    try {
      const users = await this.prisma.user.findMany({ select: { id: true }, take: 1000 })
      for (const { id } of users) {
        const data = await this.store.load(id)
        if (data.lastNightlyDateKey === dateKey) continue
        data.lastNightlyDateKey = dateKey
        try {
          await this.rebuild(id)
        } catch (error: any) {
          this.logger.warn(`Nightly graph update failed for ${id}: ${error?.message ?? error}`)
        }
      }
    } finally {
      this.ticking = false
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async collectSources(userId: string, data: UserGraphFile): Promise<SourceItem[]> {
    const memSince = data.cursor.memoriesAt ? new Date(data.cursor.memoriesAt) : undefined
    const msgSince = data.cursor.messagesAt ? new Date(data.cursor.messagesAt) : undefined
    const [memories, messages] = await Promise.all([
      this.prisma.memory
        .findMany({
          where: { userId, ...(memSince ? { updatedAt: { gt: memSince } } : {}) },
          orderBy: { updatedAt: 'asc' },
          take: MAX_ITEMS_PER_RUN,
        })
        .catch(() => []),
      this.prisma.message
        .findMany({
          where: {
            conversation: { userId },
            role: { in: ['user', 'agent'] },
            ...(msgSince ? { createdAt: { gt: msgSince } } : {}),
          },
          orderBy: { createdAt: 'asc' },
          take: MAX_ITEMS_PER_RUN,
        })
        .catch(() => []),
    ])
    const items: SourceItem[] = [
      ...memories
        .filter((m) => !this.privacy.isEncrypted(m.content))
        .map((m) => ({ source: 'memory' as const, sourceId: m.id, text: m.content, at: m.updatedAt })),
      ...messages
        .filter((m) => m.content?.trim())
        .map((m) => ({
          source: 'conversation' as const,
          sourceId: m.conversationId,
          text: `${m.role}: ${m.content}`.slice(0, 1500),
          at: m.createdAt,
        })),
      ...(await this.briefingItems(userId, data.cursor.briefingsAt)),
    ]
    return items
  }

  private async briefingItems(userId: string, since?: string): Promise<SourceItem[]> {
    const dir = path.resolve(process.env.BRIEFING_DATA_DIR ?? path.join(process.cwd(), 'data', 'briefings'))
    try {
      const raw = await fs.readFile(path.join(dir, `${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`), 'utf8')
      const history = (JSON.parse(raw)?.history ?? []) as Array<{ id: string; createdAt: string; summary: string }>
      return history
        .filter((b) => !since || b.createdAt > since)
        .slice(0, 10)
        .map((b) => ({ source: 'briefing' as const, sourceId: b.id, text: b.summary, at: new Date(b.createdAt) }))
    } catch {
      return []
    }
  }

  private *batches(items: SourceItem[]): Generator<SourceItem[]> {
    let batch: SourceItem[] = []
    let size = 0
    for (const item of items) {
      if (size + item.text.length > BATCH_CHARS && batch.length) {
        yield batch
        batch = []
        size = 0
      }
      batch.push(item)
      size += item.text.length
    }
    if (batch.length) yield batch
  }

  private async extract(userId: string, batch: SourceItem[]): Promise<Extraction | null> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } }).catch(() => null)
    const localOnly = await this.privacy.isLocalOnly(userId)
    const provider = (localOnly ? 'ollama' : settings?.preferredProvider ?? 'ollama') as LLMProvider
    const model = localOnly ? undefined : settings?.preferredModel ?? undefined
    const text = batch.map((b, i) => `[${i}] ${b.text}`).join('\n')
    try {
      const res = await this.llm.complete(
        [
          {
            role: 'user',
            content:
              'Extract named entities and relations from the notes below. ' +
              `Entity types: ${GRAPH_ENTITY_TYPES.join(', ')}. Only include specific, named things ` +
              '(not generic words). Respond with ONLY JSON: {"entities":[{"name":"","type":"","summary":"one short sentence"}],' +
              '"relations":[{"from":"entity name","to":"entity name","relation":"short verb phrase"}]}\n\n' +
              text,
          },
        ],
        [],
        'You are an information extraction engine that builds a personal knowledge graph. Output strict JSON only.',
        provider,
        undefined,
        undefined,
        model,
      )
      return parseJson(res.content ?? '')
    } catch (error: any) {
      this.logger.warn(`Graph extraction failed for ${userId}: ${error?.message ?? error}`)
      return null
    }
  }

  private merge(data: UserGraphFile, batch: SourceItem[], ex: Extraction) {
    const index = new Map(data.entities.map((e) => [norm(e.name), e]))
    const now = new Date().toISOString()
    const touched = new Map<string, GraphEntity>()
    for (const raw of ex.entities ?? []) {
      const name = String(raw?.name ?? '').trim().slice(0, 120)
      const type = String(raw?.type ?? '').toLowerCase() as GraphEntityType
      if (!name || !GRAPH_ENTITY_TYPES.includes(type)) continue
      const key = norm(name)
      let entity = index.get(key)
      if (!entity) {
        entity = { id: randomUUID(), name, type, summary: '', mentionCount: 0, mentions: [], createdAt: now, updatedAt: now }
        data.entities.push(entity)
        index.set(key, entity)
      }
      if (raw.summary && (!entity.summary || entity.summary.length < 20)) entity.summary = String(raw.summary).slice(0, 300)
      entity.updatedAt = now
      touched.set(key, entity)
      for (const item of batch) {
        const pos = item.text.toLowerCase().indexOf(key)
        if (pos < 0) continue
        entity.mentionCount += 1
        entity.mentions.push({
          source: item.source,
          sourceId: item.sourceId,
          snippet: item.text.slice(Math.max(0, pos - 80), pos + key.length + 80),
          at: item.at.toISOString(),
        })
      }
      if (entity.mentionCount === 0) entity.mentionCount = 1
    }
    for (const rel of ex.relations ?? []) {
      const from = index.get(norm(String(rel?.from ?? '')))
      const to = index.get(norm(String(rel?.to ?? '')))
      const relation = String(rel?.relation ?? 'related to').trim().slice(0, 60) || 'related to'
      if (!from || !to || from.id === to.id) continue
      const existing = data.relations.find((r) => r.fromId === from.id && r.toId === to.id && r.relation === relation)
      if (existing) existing.weight += 1
      else data.relations.push({ id: randomUUID(), fromId: from.id, toId: to.id, relation, weight: 1 })
    }
  }

  private advanceCursor(data: UserGraphFile, item: SourceItem) {
    const at = item.at.toISOString()
    const key = item.source === 'memory' ? 'memoriesAt' : item.source === 'conversation' ? 'messagesAt' : 'briefingsAt'
    if (!data.cursor[key] || data.cursor[key]! < at) data.cursor[key] = at
  }
}

function parseJson(text: string): Extraction | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Extraction
  } catch {
    return null
  }
}
