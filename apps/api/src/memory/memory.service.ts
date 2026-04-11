import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import type {
  BrowserCaptureInput,
  BrowserCaptureResult,
  CreateLocalKnowledgeSourceInput,
  LocalKnowledgeSource,
  LocalKnowledgeSyncResult,
  MemoryConflict,
  MemoryEvent,
  MemoryEventKind,
  MemoryFact,
  MemoryReviewItem,
  NanobotAutonomySchedule,
  NanobotAutonomyStatus,
  NanobotAutonomyWindow,
  NanobotMemoryCurationResult,
  NanobotMemoryCurationStatus,
  QueryMemoryInput,
  QueryMemoryResult,
  UpsertMemoryFactInput,
  UpdateNanobotAutonomyInput,
  WriteMemoryEventInput,
} from '@openagents/shared'

const CORE_MEMORY_FILES = ['SOUL.md', 'USER.md', 'MEMORY.md', 'HEARTBEAT.md'] as const
const DERIVED_MEMORY_FILE = 'cron.json'
const EXTENDED_WRITABLE_FILES = ['SKILLS.json', 'PERSONA.json', 'AUTONOMY.json'] as const
const MAX_CONTEXT_CHARS = 16_000
const MAX_DAILY_NOTE_DAYS = 30
const MAX_CONVERSATION_EXPORTS = 20
const MAX_MESSAGES_PER_CONVERSATION_EXPORT = 500
const AUTONOMY_FILE = 'AUTONOMY.json'
const LOCAL_SOURCES_FILE = 'SOURCES.json'
const DEFAULT_AUTONOMY_TIMEZONE = 'UTC'
const MEMORY_CURATION_WINDOW_HOURS = 24
const MEMORY_RETENTION_DAYS = 45
const MAX_CURATED_SUMMARY_POINTS = 14
const DEFAULT_MEMORY_EVENT_CONFIDENCE = 0.8
const MAX_TIERED_MEMORY_RESULTS = 30
const MEMORY_DECAY_DAYS = 30
const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.45
const STALE_REVIEW_DAYS = 21
const DEFAULT_LOCAL_KNOWLEDGE_MAX_FILES = 50
const MAX_LOCAL_KNOWLEDGE_FILES = 150
const DEFAULT_LOCAL_KNOWLEDGE_GLOBS = ['*.md', '*.txt', '*.json', '*.ts', '*.tsx', '*.js', '*.py']
const DEFAULT_QUERY_TEMPORAL_DECAY_DAYS = 30
const MIN_QUERY_TEMPORAL_DECAY_DAYS = 3
const MAX_QUERY_TEMPORAL_DECAY_DAYS = 180
const MEMORY_EVENT_KINDS = new Set<MemoryEventKind>([
  'conversation',
  'workflow',
  'incident',
  'extraction',
  'note',
])
const DEFAULT_AUTONOMY_WINDOWS: NanobotAutonomyWindow[] = [
  {
    label: 'business-hours',
    days: [1, 2, 3, 4, 5],
    start: '09:00',
    end: '17:00',
  },
]

export interface MemoryFileMeta {
  name: string
  size: number
  updatedAt: string
  readonly: boolean
}

export interface MemoryFileDocument extends MemoryFileMeta {
  content: string
}

interface CuratedPoint {
  text: string
  weight: number
}

interface LocalKnowledgeSourceStore {
  version: number
  sources: LocalKnowledgeSource[]
}

interface TieredRankedCandidate<T> {
  item: T
  score: number
  updatedAtIso: string
  anchor: string
  tokens: string[]
}

const DECAY_WORKER_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours
const DECAY_PRUNE_THRESHOLD = 0.04 // remove facts with effective confidence below this

@Injectable()
export class MemoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemoryService.name)
  private readonly curationStateByUser = new Map<string, NanobotMemoryCurationStatus>()
  private decayTimer?: NodeJS.Timeout

  constructor(
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.decayTimer = setInterval(() => {
      void this.runDecayCycle()
    }, DECAY_WORKER_INTERVAL_MS)
    this.decayTimer.unref()
  }

  onModuleDestroy() {
    if (this.decayTimer) {
      clearInterval(this.decayTimer)
      this.decayTimer = undefined
    }
  }

  /**
   * Decay worker: materialize confidence decay for all memory facts.
   * - Updates `confidence` in DB to the effective (decayed) value
   * - Flags facts below LOW_CONFIDENCE_REVIEW_THRESHOLD as needing review
   * - Prunes facts with effective confidence below DECAY_PRUNE_THRESHOLD
   */
  async runDecayCycle(): Promise<{ updated: number; pruned: number }> {
    try {
      const staleDate = new Date(Date.now() - STALE_REVIEW_DAYS * 24 * 60 * 60 * 1000)
      const rows = await this.prisma.memoryFact.findMany({
        where: { updatedAt: { lt: staleDate } },
        select: {
          id: true,
          confidence: true,
          updatedAt: true,
          reinforcedAt: true,
          freshUntil: true,
        },
        take: 2000,
      })

      const toDelete: string[] = []
      const toUpdate: Array<{ id: string; confidence: number }> = []

      for (const row of rows) {
        const effective = this.effectiveConfidence(
          row.confidence,
          row.updatedAt,
          row.reinforcedAt,
          row.freshUntil,
        )
        if (effective < DECAY_PRUNE_THRESHOLD) {
          toDelete.push(row.id)
        } else if (Math.abs(effective - row.confidence) > 0.01) {
          toUpdate.push({ id: row.id, confidence: effective })
        }
      }

      await this.prisma.memoryFact.deleteMany({ where: { id: { in: toDelete } } }).catch(() => null)
      for (const { id, confidence } of toUpdate) {
        await this.prisma.memoryFact.update({ where: { id }, data: { confidence } }).catch(() => null)
      }

      const pruned = toDelete.length
      const updated = toUpdate.length

      if (updated > 0 || pruned > 0) {
        this.logger.log(`Memory decay cycle: updated=${updated}, pruned=${pruned}`)
      }
      return { updated, pruned }
    } catch (err: any) {
      this.logger.warn(`Memory decay cycle failed: ${err?.message ?? String(err)}`)
      return { updated: 0, pruned: 0 }
    }
  }

  async getForUser(userId: string) {
    const rows = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    })

    return rows.map((row) => ({
      ...row,
      tags: this.parseTags(row.tags, row.id),
    }))
  }

  async upsert(userId: string, type: 'fact' | 'preference' | 'summary', content: string, tags: string[] = []) {
    return this.prisma.memory.create({
      data: { userId, type, content, tags: JSON.stringify(tags) },
    })
  }

  async delete(id: string, userId: string) {
    return this.prisma.memory.deleteMany({ where: { id, userId } })
  }

  async writeEvent(userId: string, input: WriteMemoryEventInput): Promise<MemoryEvent> {
    const kind = MEMORY_EVENT_KINDS.has(input.kind) ? input.kind : 'note'
    const summary = (input.summary ?? '').trim().slice(0, 2_000)
    if (!summary) {
      throw new BadRequestException('Memory event summary is required.')
    }

    const tags = this.normalizeTags(input.tags)
    const payload = input.payload && typeof input.payload === 'object' ? input.payload : null
    const confidence = this.clampConfidence(input.confidence, DEFAULT_MEMORY_EVENT_CONFIDENCE)
    const sourceRef = this.optionalText(input.sourceRef)?.slice(0, 800) ?? null
    const freshUntil = this.resolveFreshUntil(input.freshUntil, input.freshnessHours)
    const conflictGroup = this.optionalText(input.conflictGroup)?.slice(0, 120) ?? null

    const row = await this.prisma.memoryEvent.create({
      data: {
        userId,
        kind,
        summary,
        payload: payload ? this.safeSerialize(payload) : null,
        sourceRef,
        tags: JSON.stringify(tags),
        piiRedacted: input.piiRedacted ?? true,
        confidence,
        freshUntil,
        conflictGroup,
        reinforcedAt: new Date(),
      },
    })

    return this.toMemoryEvent(row)
  }

  async upsertFact(userId: string, input: UpsertMemoryFactInput): Promise<MemoryFact> {
    const entity = (input.entity ?? '').trim().slice(0, 180)
    const key = (input.key ?? '').trim().slice(0, 180)
    const value = (input.value ?? '').trim().slice(0, 4_000)
    if (!entity || !key || !value) {
      throw new BadRequestException('Fact entity, key, and value are required.')
    }

    const sourceRef = (input.sourceRef ?? '').trim().slice(0, 500) || null
    const confidence = this.clampConfidence(input.confidence, DEFAULT_MEMORY_EVENT_CONFIDENCE)
    const freshUntil = this.resolveFreshUntil(input.freshUntil, input.freshnessHours)
    const conflictGroup = this.optionalText(input.conflictGroup)?.slice(0, 120) ?? null
    const existing = await this.prisma.memoryFact.findUnique({
      where: {
        userId_entity_key: {
          userId,
          entity,
          key,
        },
      },
    })

    if (existing && existing.value.trim() !== value.trim()) {
      const confidenceDelta = Number((confidence - this.clampConfidence(existing.confidence, DEFAULT_MEMORY_EVENT_CONFIDENCE)).toFixed(4))
      await this.prisma.memoryConflict.create({
        data: {
          userId,
          entity,
          key,
          existingValue: existing.value.slice(0, 4000),
          incomingValue: value.slice(0, 4000),
          existingSourceRef: existing.sourceRef,
          incomingSourceRef: sourceRef,
          status: 'open',
          severity: this.conflictSeverity(existing.value, value),
          confidenceDelta,
        },
      })
    }

    const reinforcedAt = input.reinforce === false
      ? (existing?.reinforcedAt ?? new Date())
      : new Date()

    const row = await this.prisma.memoryFact.upsert({
      where: {
        userId_entity_key: {
          userId,
          entity,
          key,
        },
      },
      update: {
        value,
        sourceRef,
        confidence,
        freshUntil,
        conflictGroup,
        reinforcedAt,
      },
      create: {
        userId,
        entity,
        key,
        value,
        sourceRef,
        confidence,
        freshUntil,
        conflictGroup,
        reinforcedAt,
      },
    })

    return this.toMemoryFact(row)
  }

  async listFacts(userId: string, entity?: string, limit = 30): Promise<MemoryFact[]> {
    const safeLimit = Math.max(1, Math.min(limit, MAX_TIERED_MEMORY_RESULTS))
    const normalizedEntity = (entity ?? '').trim()

    const rows = await this.prisma.memoryFact.findMany({
      where: {
        userId,
        ...(normalizedEntity ? { entity: normalizedEntity } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: safeLimit,
    })

    return rows.map((row) => this.toMemoryFact(row))
  }

  async queryTiered(userId: string, input: QueryMemoryInput): Promise<QueryMemoryResult> {
    const query = (input.query ?? '').trim().slice(0, 500)
    if (!query) {
      throw new BadRequestException('Memory query is required.')
    }

    const safeLimit = Math.max(1, Math.min(input.limit ?? 8, MAX_TIERED_MEMORY_RESULTS))
    const tokens = this.queryTokens(query)
    const includeFacts = input.includeFacts ?? true
    const tagFilter = this.normalizeTags(input.tags)
    const minConfidence = this.clampConfidence(input.minConfidence, 0)
    const diversify = input.diversify !== false
    const temporalDecayDays = this.normalizeTemporalDecayDays(input.temporalDecayDays)

    const eventRows = await this.prisma.memoryEvent.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 240,
    })

    const rankedEvents = eventRows
      .map((row) => this.toMemoryEvent(row))
      .filter((event) => tagFilter.length === 0 || tagFilter.every((tag) => event.tags.includes(tag)))
      .filter((event) => (event.effectiveConfidence ?? event.confidence) >= minConfidence)
      .map((event): TieredRankedCandidate<MemoryEvent> => ({
        item: event,
        score: this.scoreTieredCandidate({
          textScore: this.scoreTextMatch(query, tokens, [
          event.summary,
          ...event.tags,
          event.sourceRef ?? '',
          event.payload ? this.safeSerialize(event.payload) : '',
          ]),
          confidence: event.effectiveConfidence ?? event.confidence,
          updatedAtIso: event.updatedAt,
          freshUntilIso: event.freshUntil,
          temporalDecayDays,
        }),
        updatedAtIso: event.updatedAt,
        anchor: `${event.kind}:${event.sourceRef ?? event.conflictGroup ?? ''}`,
        tokens: this.candidateTokens([
          event.summary,
          ...event.tags,
          event.sourceRef ?? '',
        ]),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.updatedAtIso.localeCompare(a.updatedAtIso))

    const eventCandidates = this.selectTieredCandidates(rankedEvents, safeLimit, diversify)
      .map((item) => item.item)

    let facts: MemoryFact[] = []
    let rankedFacts: Array<TieredRankedCandidate<MemoryFact>> = []
    if (includeFacts) {
      const factRows = await this.prisma.memoryFact.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 240,
      })
      rankedFacts = factRows
        .map((row) => this.toMemoryFact(row))
        .filter((fact) => (fact.effectiveConfidence ?? fact.confidence) >= minConfidence)
        .map((fact): TieredRankedCandidate<MemoryFact> => ({
          item: fact,
          score: this.scoreTieredCandidate({
            textScore: this.scoreTextMatch(query, tokens, [
            fact.entity,
            fact.key,
            fact.value,
            fact.sourceRef ?? '',
            ]),
            confidence: fact.effectiveConfidence ?? fact.confidence,
            updatedAtIso: fact.updatedAt,
            freshUntilIso: fact.freshUntil,
            temporalDecayDays,
          }),
          updatedAtIso: fact.updatedAt,
          anchor: `${fact.entity}:${fact.key}`,
          tokens: this.candidateTokens([
            fact.entity,
            fact.key,
            fact.value,
            fact.sourceRef ?? '',
          ]),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.updatedAtIso.localeCompare(a.updatedAtIso))

      facts = this.selectTieredCandidates(rankedFacts, safeLimit, diversify)
        .map((item) => item.item)
    }

    const includeConflicts = input.includeConflicts ?? false
    const conflicts = includeConflicts
      ? await this.listConflicts(userId, 'open', Math.min(50, safeLimit * 3))
      : undefined
    const reviewQueue = includeConflicts
      ? await this.getReviewQueue(userId, Math.min(80, safeLimit * 4))
      : undefined

    return {
      events: eventCandidates,
      facts,
      ...(conflicts ? { conflicts } : {}),
      ...(reviewQueue ? { reviewQueue } : {}),
      strategy: {
        diversify,
        temporalDecayDays,
        eventMatches: rankedEvents.length,
        factMatches: rankedFacts.length,
      },
      queriedAt: new Date().toISOString(),
    }
  }

  async listConflicts(
    userId: string,
    status?: string,
    limit = 30,
  ): Promise<MemoryConflict[]> {
    const safeLimit = Math.max(1, Math.min(limit, 200))
    const normalizedStatus = status === 'open' || status === 'resolved' || status === 'ignored'
      ? status
      : undefined

    const rows = await this.prisma.memoryConflict.findMany({
      where: {
        userId,
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: safeLimit,
    })

    return rows.map((row) => this.toMemoryConflict(row))
  }

  async resolveConflict(
    userId: string,
    conflictId: string,
    status: 'resolved' | 'ignored' = 'resolved',
  ): Promise<MemoryConflict> {
    const current = await this.prisma.memoryConflict.findUnique({
      where: { id: conflictId },
    })
    if (!current || current.userId !== userId) {
      throw new NotFoundException(`Memory conflict "${conflictId}" not found.`)
    }

    const row = await this.prisma.memoryConflict.update({
      where: { id: conflictId },
      data: {
        status,
        resolvedAt: new Date(),
      },
    })

    return this.toMemoryConflict(row)
  }

  async getReviewQueue(userId: string, limit = 30): Promise<MemoryReviewItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 200))
    const staleCutoff = Date.now() - STALE_REVIEW_DAYS * 24 * 60 * 60 * 1000

    const [eventsRaw, factsRaw, conflictsRaw] = await Promise.all([
      this.prisma.memoryEvent.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 220,
      }),
      this.prisma.memoryFact.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 220,
      }),
      this.prisma.memoryConflict.findMany({
        where: { userId, status: 'open' },
        orderBy: { updatedAt: 'desc' },
        take: 120,
      }),
    ])

    const items: MemoryReviewItem[] = []

    for (const event of eventsRaw.map((row) => this.toMemoryEvent(row))) {
      const confidence = event.effectiveConfidence ?? event.confidence
      const updatedTs = new Date(event.updatedAt).getTime()
      const stale = Number.isFinite(updatedTs) && updatedTs <= staleCutoff
      if (confidence >= LOW_CONFIDENCE_REVIEW_THRESHOLD && !stale) continue
      items.push({
        id: event.id,
        type: 'event',
        reason: confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD ? 'low_confidence' : 'stale',
        confidence,
        summary: event.summary.slice(0, 200),
        updatedAt: event.updatedAt,
      })
    }

    for (const fact of factsRaw.map((row) => this.toMemoryFact(row))) {
      const confidence = fact.effectiveConfidence ?? fact.confidence
      const updatedTs = new Date(fact.updatedAt).getTime()
      const stale = Number.isFinite(updatedTs) && updatedTs <= staleCutoff
      if (confidence >= LOW_CONFIDENCE_REVIEW_THRESHOLD && !stale) continue
      items.push({
        id: fact.id,
        type: 'fact',
        reason: confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD ? 'low_confidence' : 'stale',
        confidence,
        summary: `${fact.entity}.${fact.key}: ${fact.value}`.slice(0, 200),
        updatedAt: fact.updatedAt,
      })
    }

    for (const conflict of conflictsRaw.map((row) => this.toMemoryConflict(row))) {
      items.push({
        id: conflict.id,
        type: 'fact',
        reason: 'conflict',
        confidence: Math.max(0, 1 - Math.abs(conflict.confidenceDelta)),
        summary: `Conflict ${conflict.entity}.${conflict.key}: "${conflict.existingValue}" vs "${conflict.incomingValue}"`.slice(0, 220),
        updatedAt: conflict.updatedAt,
      })
    }

    return items
      .sort((a, b) => a.confidence - b.confidence || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, safeLimit)
  }

  async listSources(userId: string): Promise<LocalKnowledgeSource[]> {
    const store = await this.readLocalKnowledgeSources(userId)
    return [...store.sources].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async createSource(userId: string, input: CreateLocalKnowledgeSourceInput): Promise<LocalKnowledgeSource> {
    const store = await this.readLocalKnowledgeSources(userId)
    const source = this.sanitizeLocalKnowledgeSource(userId, input)
    store.sources = [
      ...store.sources.filter((candidate) => candidate.path !== source.path),
      source,
    ]
    await this.writeLocalKnowledgeSources(userId, store)
    return source
  }

  async deleteSource(userId: string, sourceId: string) {
    const store = await this.readLocalKnowledgeSources(userId)
    store.sources = store.sources.filter((source) => source.id !== sourceId)
    await this.writeLocalKnowledgeSources(userId, store)
    return { ok: true as const }
  }

  async syncSource(userId: string, sourceId: string): Promise<LocalKnowledgeSyncResult> {
    const store = await this.readLocalKnowledgeSources(userId)
    const source = store.sources.find((candidate) => candidate.id === sourceId)
    if (!source) {
      throw new NotFoundException(`Knowledge source "${sourceId}" not found.`)
    }

    const syncWarnings: string[] = []
    let syncedFiles = 0
    let createdEvents = 0

    try {
      const files = await this.collectKnowledgeFiles(source.path, source.kind, source.maxFiles)
      syncedFiles = files.length
      for (const filePath of files) {
        const content = await fs.readFile(filePath, 'utf8').catch(() => '')
        const clipped = content.trim().slice(0, 4_000)
        if (!clipped) continue
        const relative = path.relative(source.path, filePath) || path.basename(filePath)
        await this.writeEvent(userId, {
          kind: 'note',
          summary: `Knowledge sync: ${relative}`,
          payload: {
            sourceId: source.id,
            sourceKind: source.kind,
            filePath,
            excerpt: clipped,
          },
          sourceRef: filePath,
          tags: ['knowledge-sync', source.kind],
          piiRedacted: false,
          confidence: 0.75,
        })
        createdEvents += 1
      }
      source.status = 'active'
      source.lastError = null
    } catch (error: any) {
      source.status = 'error'
      const lastError = error?.message ?? 'Knowledge sync failed.'
      source.lastError = lastError
      syncWarnings.push(lastError)
    }

    const syncedAt = new Date().toISOString()
    source.lastSyncedAt = syncedAt
    source.updatedAt = syncedAt
    await this.writeLocalKnowledgeSources(userId, store)

    return {
      source,
      syncedFiles,
      createdEvents,
      warnings: syncWarnings,
      syncedAt,
    }
  }

  async listFiles(userId: string): Promise<MemoryFileMeta[]> {
    const userDir = await this.syncFiles(userId)
    const entries = await fs.readdir(userDir, { withFileTypes: true })
    const files: MemoryFileMeta[] = []

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const fullPath = path.join(userDir, entry.name)
      const stat = await fs.stat(fullPath)
      files.push({
        name: entry.name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        readonly: this.isReadonlyFile(entry.name),
      })
    }

    return files.sort((a, b) => a.name.localeCompare(b.name))
  }

  async readFile(userId: string, fileName: string): Promise<MemoryFileDocument> {
    this.assertFileName(fileName)
    const userDir = await this.syncFiles(userId)
    const fullPath = path.join(userDir, fileName)
    let content = ''
    try {
      content = await fs.readFile(fullPath, 'utf8')
    } catch {
      throw new NotFoundException(`Memory file "${fileName}" not found.`)
    }
    const stat = await fs.stat(fullPath)
    return {
      name: fileName,
      content,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      readonly: this.isReadonlyFile(fileName),
    }
  }

  async writeFile(userId: string, fileName: string, content: string): Promise<MemoryFileDocument> {
    this.assertFileName(fileName)
    if (this.isReadonlyFile(fileName)) {
      throw new BadRequestException(`File "${fileName}" is generated and cannot be edited directly.`)
    }

    const userDir = await this.ensureUserDir(userId)
    const fullPath = path.join(userDir, fileName)
    await fs.writeFile(fullPath, content, 'utf8')

    // Keep SOUL.md synchronized with the custom system prompt used by the agent.
    if (fileName === 'SOUL.md') {
      await this.prisma.userSettings.upsert({
        where: { userId },
        update: { customSystemPrompt: content.trim() || null },
        create: { userId, customSystemPrompt: content.trim() || null },
      })
    }

    const stat = await fs.stat(fullPath)
    return {
      name: fileName,
      content,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      readonly: false,
    }
  }

  async syncFiles(userId: string) {
    const userDir = await this.ensureUserDir(userId)

    const [profile, settings, memories, cronJobs, conversations] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      this.prisma.userSettings.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
      this.prisma.memory.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.cronJob.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: MAX_CONVERSATION_EXPORTS,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: MAX_MESSAGES_PER_CONVERSATION_EXPORT,
          },
        },
      }),
    ])

    if (!profile) return userDir

    const soul = settings.customSystemPrompt?.trim() || [
      '# SOUL',
      '',
      'You are a practical assistant.',
      'You should use tools when useful, ask for approval before sensitive actions,',
      'and keep responses concise and actionable.',
    ].join('\n')

    const userDoc = [
      '# USER',
      '',
      `id: ${profile.id}`,
      `name: ${profile.name ?? ''}`,
      `email: ${profile.email}`,
      `joined: ${profile.createdAt.toISOString()}`,
      `preferred_provider: ${settings.preferredProvider}`,
      `preferred_model: ${settings.preferredModel}`,
      '',
      'preferences:',
      '- language: en',
      '- tone: concise',
    ].join('\n')

    const memoryDoc = [
      '# MEMORY',
      '',
      ...memories.map((entry) => `- [${entry.type}] ${entry.content}`),
    ].join('\n')

    const heartbeatDoc = [
      '# HEARTBEAT',
      '',
      '## Active Tasks',
      ...cronJobs
        .filter((job) => job.enabled)
        .map((job) => `- ${job.name} (${job.scheduleKind}: ${job.scheduleValue})`),
      '',
      '## Disabled Tasks',
      ...cronJobs
        .filter((job) => !job.enabled)
        .map((job) => `- ${job.name}`),
    ].join('\n')

    await this.writeCoreFileIfMissing(userDir, 'SOUL.md', soul)
    await this.writeCoreFileIfMissing(userDir, 'USER.md', userDoc)
    await this.writeCoreFileIfMissing(userDir, 'MEMORY.md', memoryDoc)
    await this.writeCoreFileIfMissing(userDir, 'HEARTBEAT.md', heartbeatDoc)

    await fs.writeFile(path.join(userDir, DERIVED_MEMORY_FILE), JSON.stringify(cronJobs, null, 2), 'utf8')

    const dayBuckets = new Map<string, Array<{ conversationId: string; role: string; content: string; createdAt: string }>>()
    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        const date = message.createdAt.toISOString().slice(0, 10)
        if (!dayBuckets.has(date)) dayBuckets.set(date, [])
        dayBuckets.get(date)!.push({
          conversationId: conversation.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        })
      }

      const jsonl = conversation.messages
        .map((message) => JSON.stringify({
          id: message.id,
          conversationId: conversation.id,
          role: message.role,
          status: message.status,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        }))
        .join('\n')
      await fs.writeFile(path.join(userDir, `tg_${conversation.id}.jsonl`), jsonl, 'utf8')
    }

    const sortedDays = [...dayBuckets.keys()]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, MAX_DAILY_NOTE_DAYS)

    for (const day of sortedDays) {
      const lines = dayBuckets.get(day) ?? []
      const body = [
        `# ${day}`,
        '',
        ...lines.map((line) => `- ${line.createdAt} [${line.role}] (${line.conversationId}) ${line.content}`),
      ].join('\n')
      await fs.writeFile(path.join(userDir, `${day}.md`), body, 'utf8')
    }

    return userDir
  }

  async buildFilesystemContext(userId: string) {
    const userDir = await this.ensureCoreMemoryFiles(userId)
    const sections: string[] = []
    let used = 0

    for (const fileName of CORE_MEMORY_FILES) {
      const fullPath = path.join(userDir, fileName)
      try {
        const content = (await fs.readFile(fullPath, 'utf8')).trim()
        if (!content) continue
        const section = `## ${fileName}\n${content}`
        if (used + section.length > MAX_CONTEXT_CHARS) break
        sections.push(section)
        used += section.length
      } catch {
        // Skip missing file; ensureCoreMemoryFiles creates defaults on demand.
      }
    }

    return sections.join('\n\n')
  }

  /**
   * Extract useful long-term memories from a conversation turn.
   * MVP: simple heuristic extraction (no LLM call, to save tokens).
   * Later: use LLM to extract structured facts.
   */
  async extractAndStore(userId: string, userMessage: string, agentReply: string) {
    // MVP: detect preference statements
    const preferencePatterns = [
      /I (prefer|like|love|hate|always|never|usually) (.+)/i,
      /my (name|email|timezone|language|role|company) is (.+)/i,
    ]

    for (const pattern of preferencePatterns) {
      const match = userMessage.match(pattern)
      if (match) {
        await this.upsert(userId, 'preference', userMessage.trim(), ['auto-extracted'])
        break
      }
    }
  }

  getCurationStatus(userId: string): NanobotMemoryCurationStatus {
    return this.curationStateByUser.get(userId) ?? {
      lastCuratedAt: null,
      lastSource: null,
      summaryPoints: 0,
      dedupedEntries: 0,
      expiredEntries: 0,
    }
  }

  async maybeRunNightlyCuration(userId: string, now = new Date()) {
    const utcHour = now.getUTCHours()
    if (utcHour < 1 || utcHour > 4) return null

    const status = this.getCurationStatus(userId)
    const alreadyCuratedToday = status.lastCuratedAt?.slice(0, 10) === now.toISOString().slice(0, 10)
    if (alreadyCuratedToday) return null

    return this.curateNightly(userId, 'nightly')
  }

  async curateNightly(
    userId: string,
    source: 'manual' | 'nightly' | 'heartbeat-recovery' = 'manual',
  ): Promise<NanobotMemoryCurationResult> {
    const now = new Date()
    const since = new Date(now.getTime() - MEMORY_CURATION_WINDOW_HOURS * 60 * 60 * 1000)

    const allMemories = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 600,
    })

    const dedupeKeepIds = new Set<string>()
    const dedupeSeen = new Set<string>()
    for (const memory of allMemories) {
      const key = `${memory.type}:${this.normalizeMemoryKey(memory.content)}`
      if (!key || key.endsWith(':')) {
        dedupeKeepIds.add(memory.id)
        continue
      }
      if (dedupeSeen.has(key)) continue
      dedupeSeen.add(key)
      dedupeKeepIds.add(memory.id)
    }
    const duplicateIds = allMemories
      .filter((memory) => !dedupeKeepIds.has(memory.id))
      .map((memory) => memory.id)
    if (duplicateIds.length > 0) {
      await this.prisma.memory.deleteMany({
        where: { userId, id: { in: duplicateIds } },
      })
    }

    const staleCutoff = new Date(now.getTime() - MEMORY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const staleIds = allMemories
      .filter((memory) => dedupeKeepIds.has(memory.id))
      .filter((memory) => {
        if (memory.updatedAt >= staleCutoff) return false
        if (memory.type !== 'summary') return false
        const tags = this.parseTags(memory.tags, memory.id)
        return tags.some((tag) => /auto|nightly|curat/i.test(tag))
      })
      .map((memory) => memory.id)

    if (staleIds.length > 0) {
      await this.prisma.memory.deleteMany({
        where: { userId, id: { in: staleIds } },
      })
    }

    const recentMessages = await this.prisma.message.findMany({
      where: {
        conversation: { userId },
        createdAt: { gte: since },
        role: { in: ['user', 'agent'] },
        status: 'done',
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        role: true,
        content: true,
        createdAt: true,
      },
    })

    const points = new Map<string, CuratedPoint>()
    for (const message of recentMessages) {
      const compact = message.content.replace(/\s+/g, ' ').trim()
      if (compact.length < 16) continue
      const clipped = compact.slice(0, 180)
      const key = this.normalizeMemoryKey(clipped)
      if (!key) continue

      let weight = message.role === 'user' ? 3 : 1
      if (/(must|important|deadline|prefer|always|never|avoid|need to)/i.test(clipped)) weight += 2
      if (/\?$/.test(clipped)) weight -= 1
      if (/(thanks|thank you|ok|done|great)/i.test(clipped)) weight -= 1

      const existing = points.get(key)
      if (!existing || existing.weight < weight) {
        points.set(key, { text: clipped, weight })
      }
    }

    const summaryLines = [...points.values()]
      .sort((a, b) => b.weight - a.weight || b.text.length - a.text.length)
      .slice(0, MAX_CURATED_SUMMARY_POINTS)
      .map((point) => `- ${point.text}`)

    const dayTag = now.toISOString().slice(0, 10)
    const summaryContent = [
      `Nightly memory curation (${dayTag})`,
      ...summaryLines,
    ].join('\n')
    const existingDailySummary = allMemories.some((memory) => {
      if (memory.type !== 'summary') return false
      const tags = this.parseTags(memory.tags, memory.id)
      return tags.includes(`nightly:${dayTag}`)
    })

    if (!existingDailySummary && summaryLines.length > 0) {
      await this.prisma.memory.create({
        data: {
          userId,
          type: 'summary',
          content: summaryContent,
          tags: JSON.stringify(['auto-curated', 'nightly-curation', `nightly:${dayTag}`]),
        },
      })
    }

    const curatedMemories = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 240,
    })

    const memoryDoc = [
      '# MEMORY',
      '',
      `Last curated: ${now.toISOString()} (${source})`,
      `Entries: ${curatedMemories.length}`,
      '',
      '## Curated Summary',
      ...(summaryLines.length > 0
        ? summaryLines
        : ['- No high-signal summaries generated in the last curation window.']),
      '',
      '## Recent Memory Entries',
      ...curatedMemories.slice(0, 80).map((entry) => `- [${entry.type}] ${entry.content.replace(/\s+/g, ' ').trim()}`),
    ].join('\n')

    const userDir = await this.ensureUserDir(userId)
    const memoryFilePath = path.join(userDir, 'MEMORY.md')
    await fs.writeFile(memoryFilePath, memoryDoc, 'utf8')
    const memoryStat = await fs.stat(memoryFilePath)

    const status: NanobotMemoryCurationStatus = {
      lastCuratedAt: now.toISOString(),
      lastSource: source,
      summaryPoints: summaryLines.length,
      dedupedEntries: duplicateIds.length,
      expiredEntries: staleIds.length,
    }
    this.curationStateByUser.set(userId, status)

    return {
      curatedAt: now.toISOString(),
      source,
      summaryPoints: summaryLines.length,
      dedupedEntries: duplicateIds.length,
      expiredEntries: staleIds.length,
      memoryEntries: curatedMemories.length,
      memoryFileBytes: memoryStat.size,
    }
  }

  async captureBrowserSelection(userId: string, input: BrowserCaptureInput): Promise<BrowserCaptureResult> {
    const url = (input.url ?? '').trim()
    const selection = (input.selection ?? '').trim()
    const title = (input.title ?? '').trim()
    const note = (input.note ?? '').trim()
    const conversationId = input.conversationId?.trim() || null

    if (!url) throw new BadRequestException('Capture URL is required.')
    if (!selection) throw new BadRequestException('Capture selection is required.')

    let host = 'unknown-host'
    try {
      host = new URL(url).hostname || host
    } catch {
      // Keep fallback host.
    }

    const clippedSelection = selection.slice(0, 8_000)
    const clippedNote = note.slice(0, 1_000)
    const nowIso = new Date().toISOString()

    let conversation: { id: string; userId: string } | null = null
    if (conversationId) {
      conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, userId: true },
      })
      if (!conversation || conversation.userId !== userId) {
        throw new BadRequestException('Conversation not found for browser capture target.')
      }
    }

    const content = [
      `Captured at ${nowIso}`,
      title ? `Title: ${title.slice(0, 200)}` : '',
      `URL: ${url.slice(0, 800)}`,
      '',
      'Selection:',
      clippedSelection,
      clippedNote ? `\nNote:\n${clippedNote}` : '',
    ].filter(Boolean).join('\n')

    const tags = ['browser-capture', host]
    const memory = await this.prisma.memory.create({
      data: {
        userId,
        type: 'summary',
        content,
        tags: JSON.stringify(tags),
      },
    })

    let conversationMessageId: string | null = null
    if (conversation) {
      const message = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          status: 'done',
          content: [
            `[Browser Capture] ${title ? title.slice(0, 160) : host}`,
            `Source: ${url.slice(0, 800)}`,
            '',
            clippedSelection,
            clippedNote ? `\nNote:\n${clippedNote}` : '',
          ].filter(Boolean).join('\n'),
        },
      })
      conversationMessageId = message.id

      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      })
    }

    return {
      capturedAt: nowIso,
      memory: {
        id: memory.id,
        userId: memory.userId,
        type: memory.type === 'fact' || memory.type === 'preference' || memory.type === 'summary'
          ? memory.type
          : 'summary',
        content: memory.content,
        tags: this.parseTags(memory.tags, memory.id),
        createdAt: memory.createdAt.toISOString(),
        updatedAt: memory.updatedAt.toISOString(),
      },
      conversationId,
      conversationMessageId,
    }
  }

  async getAutonomySchedule(userId: string): Promise<NanobotAutonomySchedule> {
    const userDir = await this.ensureUserDir(userId)
    const filePath = path.join(userDir, AUTONOMY_FILE)

    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<NanobotAutonomySchedule>
      return this.sanitizeAutonomySchedule(parsed)
    } catch {
      const fallback = this.defaultAutonomySchedule()
      await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8')
      return fallback
    }
  }

  async updateAutonomySchedule(
    userId: string,
    patch: UpdateNanobotAutonomyInput,
  ): Promise<NanobotAutonomySchedule> {
    const current = await this.getAutonomySchedule(userId)
    const next = this.sanitizeAutonomySchedule({
      enabled: patch.enabled ?? current.enabled,
      timezone: patch.timezone ?? current.timezone,
      windows: patch.windows ?? current.windows,
      updatedAt: new Date().toISOString(),
    })

    const userDir = await this.ensureUserDir(userId)
    const filePath = path.join(userDir, AUTONOMY_FILE)
    await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  async getAutonomyStatus(userId: string, now = new Date()): Promise<NanobotAutonomyStatus> {
    const schedule = await this.getAutonomySchedule(userId)
    if (!schedule.enabled) {
      return {
        now: now.toISOString(),
        scheduleEnabled: false,
        timezone: schedule.timezone,
        withinWindow: true,
        reason: 'Autonomy schedule is disabled; autonomous actions are allowed.',
        activeWindow: null,
      }
    }

    if (schedule.windows.length === 0) {
      return {
        now: now.toISOString(),
        scheduleEnabled: true,
        timezone: schedule.timezone,
        withinWindow: false,
        reason: 'Autonomy schedule is enabled but has no windows configured.',
        activeWindow: null,
      }
    }

    const local = this.getLocalClock(now, schedule.timezone)
    for (const window of schedule.windows) {
      if (this.windowMatches(window, local.day, local.minutes)) {
        return {
          now: now.toISOString(),
          scheduleEnabled: true,
          timezone: schedule.timezone,
          withinWindow: true,
          reason: `Within autonomy window "${window.label || `${window.start}-${window.end}`}".`,
          activeWindow: window,
        }
      }
    }

    return {
      now: now.toISOString(),
      scheduleEnabled: true,
      timezone: schedule.timezone,
      withinWindow: false,
      reason: 'Current time is outside configured autonomy windows.',
      activeWindow: null,
    }
  }

  private async ensureUserDir(userId: string) {
    const root = (process.env.MEMORY_FILES_ROOT ?? path.resolve(process.cwd(), 'data', 'memory')).trim()
    const userDir = path.join(root, userId)
    await fs.mkdir(userDir, { recursive: true })
    return userDir
  }

  private async readLocalKnowledgeSources(userId: string): Promise<LocalKnowledgeSourceStore> {
    const userDir = await this.ensureUserDir(userId)
    const fullPath = path.join(userDir, LOCAL_SOURCES_FILE)
    try {
      const raw = await fs.readFile(fullPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<LocalKnowledgeSourceStore>
      const sources = Array.isArray(parsed.sources) ? parsed.sources : []
      return {
        version: 1,
        sources: sources
          .filter((source) => source && typeof source === 'object')
          .map((source) => this.normalizeStoredLocalKnowledgeSource(userId, source as LocalKnowledgeSource))
          .filter((source): source is LocalKnowledgeSource => Boolean(source)),
      }
    } catch {
      return { version: 1, sources: [] }
    }
  }

  private async writeLocalKnowledgeSources(userId: string, store: LocalKnowledgeSourceStore) {
    const userDir = await this.ensureUserDir(userId)
    const fullPath = path.join(userDir, LOCAL_SOURCES_FILE)
    await fs.writeFile(fullPath, JSON.stringify(store, null, 2), 'utf8')
  }

  private sanitizeLocalKnowledgeSource(userId: string, input: CreateLocalKnowledgeSourceInput): LocalKnowledgeSource {
    const normalizedPath = path.resolve((input.path ?? '').trim())
    if (!normalizedPath) {
      throw new BadRequestException('Knowledge source path is required.')
    }

    const kind = this.normalizeLocalKnowledgeKind(input.kind, normalizedPath)
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      userId,
      path: normalizedPath,
      kind,
      includeGlobs: this.normalizeKnowledgeGlobs(input.includeGlobs),
      maxFiles: this.normalizeMaxKnowledgeFiles(input.maxFiles),
      status: 'active',
      lastSyncedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  private normalizeStoredLocalKnowledgeSource(userId: string, source: LocalKnowledgeSource) {
    const normalizedPath = this.optionalText(source.path)
    if (!normalizedPath) return null
    const kind = this.normalizeLocalKnowledgeKind(source.kind, normalizedPath)
    const createdAt = this.normalizeIso(source.createdAt) ?? new Date().toISOString()
    const updatedAt = this.normalizeIso(source.updatedAt) ?? createdAt
    return {
      id: this.optionalText(source.id) ?? randomUUID(),
      userId,
      path: path.resolve(normalizedPath),
      kind,
      includeGlobs: this.normalizeKnowledgeGlobs(source.includeGlobs),
      maxFiles: this.normalizeMaxKnowledgeFiles(source.maxFiles),
      status: source.status === 'error' ? 'error' : 'active',
      lastSyncedAt: this.normalizeIso(source.lastSyncedAt),
      lastError: this.optionalText(source.lastError),
      createdAt,
      updatedAt,
    } satisfies LocalKnowledgeSource
  }

  private normalizeLocalKnowledgeKind(raw: unknown, targetPath: string): LocalKnowledgeSource['kind'] {
    if (raw === 'file' || raw === 'folder' || raw === 'repo') return raw
    const basename = path.basename(targetPath).toLowerCase()
    if (basename === '.git') return 'repo'
    if (targetPath.endsWith('.git')) return 'repo'
    if (path.extname(targetPath)) return 'file'
    return 'folder'
  }

  private normalizeKnowledgeGlobs(raw: unknown) {
    if (!Array.isArray(raw)) return [...DEFAULT_LOCAL_KNOWLEDGE_GLOBS]
    const values = raw
      .map((entry) => this.optionalText(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 20)
    return values.length > 0 ? values : [...DEFAULT_LOCAL_KNOWLEDGE_GLOBS]
  }

  private normalizeMaxKnowledgeFiles(raw: unknown) {
    const parsed = Number.parseInt(`${raw ?? ''}`, 10)
    if (!Number.isFinite(parsed)) return DEFAULT_LOCAL_KNOWLEDGE_MAX_FILES
    return Math.max(1, Math.min(parsed, MAX_LOCAL_KNOWLEDGE_FILES))
  }

  private async collectKnowledgeFiles(targetPath: string, kind: LocalKnowledgeSource['kind'], maxFiles: number) {
    const stats = await fs.stat(targetPath)
    if (kind === 'file') {
      return stats.isFile() ? [targetPath] : []
    }

    const files: string[] = []
    const queue = [targetPath]
    while (queue.length > 0 && files.length < maxFiles) {
      const current = queue.shift()!
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (files.length >= maxFiles) break
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist') {
          continue
        }
        const fullPath = path.join(current, entry.name)
        if (entry.isDirectory()) {
          queue.push(fullPath)
          continue
        }
        if (!entry.isFile()) continue
        const extension = path.extname(entry.name).toLowerCase()
        if (!['.md', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.py', '.yml', '.yaml'].includes(extension)) {
          continue
        }
        files.push(fullPath)
      }
    }
    return files
  }

  private async writeCoreFileIfMissing(userDir: string, fileName: (typeof CORE_MEMORY_FILES)[number], content: string) {
    const fullPath = path.join(userDir, fileName)
    try {
      await fs.access(fullPath)
    } catch {
      await fs.writeFile(fullPath, content, 'utf8')
    }
  }

  private async ensureCoreMemoryFiles(userId: string) {
    const userDir = await this.ensureUserDir(userId)

    const [profile, settings, memories, cronJobs] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      this.prisma.userSettings.findUnique({
        where: { userId },
        select: {
          customSystemPrompt: true,
          preferredProvider: true,
          preferredModel: true,
        },
      }),
      this.prisma.memory.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.cronJob.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    if (!profile) return userDir

    const soul = settings?.customSystemPrompt?.trim() || [
      '# SOUL',
      '',
      'You are a practical assistant.',
      'You should use tools when useful, ask for approval before sensitive actions,',
      'and keep responses concise and actionable.',
    ].join('\n')

    const userDoc = [
      '# USER',
      '',
      `id: ${profile.id}`,
      `name: ${profile.name ?? ''}`,
      `email: ${profile.email}`,
      `joined: ${profile.createdAt.toISOString()}`,
      `preferred_provider: ${settings?.preferredProvider ?? ''}`,
      `preferred_model: ${settings?.preferredModel ?? ''}`,
      '',
      'preferences:',
      '- language: en',
      '- tone: concise',
    ].join('\n')

    const memoryDoc = [
      '# MEMORY',
      '',
      ...memories.map((entry) => `- [${entry.type}] ${entry.content}`),
    ].join('\n')

    const heartbeatDoc = [
      '# HEARTBEAT',
      '',
      '## Active Tasks',
      ...cronJobs
        .filter((job) => job.enabled)
        .map((job) => `- ${job.name} (${job.scheduleKind}: ${job.scheduleValue})`),
      '',
      '## Disabled Tasks',
      ...cronJobs
        .filter((job) => !job.enabled)
        .map((job) => `- ${job.name}`),
    ].join('\n')

    await Promise.all([
      this.writeCoreFileIfMissing(userDir, 'SOUL.md', soul),
      this.writeCoreFileIfMissing(userDir, 'USER.md', userDoc),
      this.writeCoreFileIfMissing(userDir, 'MEMORY.md', memoryDoc),
      this.writeCoreFileIfMissing(userDir, 'HEARTBEAT.md', heartbeatDoc),
    ])

    return userDir
  }

  private assertFileName(fileName: string) {
    const normalized = fileName.trim()
    if (!normalized) throw new BadRequestException('File name is required.')
    if (normalized.includes('\\') || normalized.includes('/') || normalized.includes('..')) {
      throw new BadRequestException('Invalid file name.')
    }

    const isCore = CORE_MEMORY_FILES.includes(normalized as (typeof CORE_MEMORY_FILES)[number])
    const isExtended = EXTENDED_WRITABLE_FILES.includes(normalized as (typeof EXTENDED_WRITABLE_FILES)[number])
    const isDerived = normalized === DERIVED_MEMORY_FILE
      || /^\d{4}-\d{2}-\d{2}\.md$/.test(normalized)
      || /^tg_[A-Za-z0-9_-]+\.jsonl$/.test(normalized)

    if (!isCore && !isExtended && !isDerived) {
      throw new BadRequestException(`Unsupported memory file: ${normalized}`)
    }
  }

  private isReadonlyFile(fileName: string) {
    return fileName === DERIVED_MEMORY_FILE
      || /^\d{4}-\d{2}-\d{2}\.md$/.test(fileName)
      || /^tg_[A-Za-z0-9_-]+\.jsonl$/.test(fileName)
  }

  private defaultAutonomySchedule(): NanobotAutonomySchedule {
    return {
      enabled: false,
      timezone: DEFAULT_AUTONOMY_TIMEZONE,
      windows: [...DEFAULT_AUTONOMY_WINDOWS],
      updatedAt: new Date().toISOString(),
    }
  }

  private sanitizeAutonomySchedule(raw: Partial<NanobotAutonomySchedule>): NanobotAutonomySchedule {
    const timezone = this.sanitizeTimezone(raw.timezone)
    const windows = this.sanitizeAutonomyWindows(raw.windows)
    return {
      enabled: Boolean(raw.enabled),
      timezone,
      windows,
      updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString(),
    }
  }

  private sanitizeAutonomyWindows(raw: unknown): NanobotAutonomyWindow[] {
    if (!Array.isArray(raw)) return [...DEFAULT_AUTONOMY_WINDOWS]
    const normalized: NanobotAutonomyWindow[] = []

    for (const candidate of raw) {
      if (!candidate || typeof candidate !== 'object') continue
      const record = candidate as Partial<NanobotAutonomyWindow>
      const start = this.sanitizeClockValue(record.start)
      const end = this.sanitizeClockValue(record.end)
      if (!start || !end) continue

      const daysInput = Array.isArray(record.days) ? record.days : []
      const days = [...new Set(daysInput
        .map((value) => Number.parseInt(`${value}`, 10))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6))]
      if (days.length === 0) continue

      const label = typeof record.label === 'string' ? record.label.trim().slice(0, 80) : ''
      normalized.push({
        ...(label ? { label } : {}),
        days,
        start,
        end,
      })
      if (normalized.length >= 16) break
    }

    return normalized.length > 0 ? normalized : [...DEFAULT_AUTONOMY_WINDOWS]
  }

  private sanitizeTimezone(raw: unknown) {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) return DEFAULT_AUTONOMY_TIMEZONE
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
      return value
    } catch {
      return DEFAULT_AUTONOMY_TIMEZONE
    }
  }

  private sanitizeClockValue(raw: unknown) {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!/^\d{2}:\d{2}$/.test(value)) return null
    const hour = Number.parseInt(value.slice(0, 2), 10)
    const minute = Number.parseInt(value.slice(3, 5), 10)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return `${value.slice(0, 2)}:${value.slice(3, 5)}`
  }

  private parseClockMinutes(value: string) {
    const hour = Number.parseInt(value.slice(0, 2), 10)
    const minute = Number.parseInt(value.slice(3, 5), 10)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    return hour * 60 + minute
  }

  private getLocalClock(now: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)

    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun'
    const hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value ?? '0', 10)
    const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value ?? '0', 10)

    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }
    return {
      day: map[weekday] ?? 0,
      minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
    }
  }

  private windowMatches(window: NanobotAutonomyWindow, day: number, minutes: number) {
    const start = this.parseClockMinutes(window.start)
    const end = this.parseClockMinutes(window.end)
    if (start == null || end == null) return false

    const days = new Set(window.days)
    const previousDay = (day + 6) % 7

    if (start === end) {
      return days.has(day)
    }

    if (start < end) {
      return days.has(day) && minutes >= start && minutes < end
    }

    // Cross-midnight window (for example: 22:00 -> 03:00)
    if (days.has(day) && minutes >= start) return true
    if (days.has(previousDay) && minutes < end) return true
    return false
  }

  private toMemoryEvent(row: {
    id: string
    userId: string
    kind: string
    summary: string
    payload: string | null
    sourceRef: string | null
    tags: string
    piiRedacted: boolean
    confidence: number
    freshUntil: Date | null
    conflictGroup: string | null
    reinforcedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): MemoryEvent {
    const parsedPayload = this.parseRecordJson(row.payload, `memory-event:${row.id}:payload`)
    const effectiveConfidence = this.effectiveConfidence(
      row.confidence,
      row.updatedAt,
      row.reinforcedAt,
      row.freshUntil,
    )
    return {
      id: row.id,
      userId: row.userId,
      kind: MEMORY_EVENT_KINDS.has(row.kind as MemoryEventKind)
        ? (row.kind as MemoryEventKind)
        : 'note',
      summary: row.summary,
      payload: parsedPayload,
      sourceRef: row.sourceRef,
      tags: this.parseTags(row.tags, row.id),
      piiRedacted: row.piiRedacted,
      confidence: this.clampConfidence(row.confidence, DEFAULT_MEMORY_EVENT_CONFIDENCE),
      effectiveConfidence,
      freshUntil: row.freshUntil ? row.freshUntil.toISOString() : null,
      conflictGroup: row.conflictGroup ?? null,
      reinforcedAt: row.reinforcedAt ? row.reinforcedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toMemoryFact(row: {
    id: string
    userId: string
    entity: string
    key: string
    value: string
    sourceRef: string | null
    confidence: number
    freshUntil: Date | null
    conflictGroup: string | null
    reinforcedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): MemoryFact {
    const effectiveConfidence = this.effectiveConfidence(
      row.confidence,
      row.updatedAt,
      row.reinforcedAt,
      row.freshUntil,
    )
    return {
      id: row.id,
      userId: row.userId,
      entity: row.entity,
      key: row.key,
      value: row.value,
      sourceRef: row.sourceRef,
      confidence: this.clampConfidence(row.confidence, DEFAULT_MEMORY_EVENT_CONFIDENCE),
      effectiveConfidence,
      freshUntil: row.freshUntil ? row.freshUntil.toISOString() : null,
      conflictGroup: row.conflictGroup ?? null,
      reinforcedAt: row.reinforcedAt ? row.reinforcedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toMemoryConflict(row: {
    id: string
    userId: string
    entity: string
    key: string
    existingValue: string
    incomingValue: string
    existingSourceRef: string | null
    incomingSourceRef: string | null
    status: string
    severity: string
    confidenceDelta: number
    createdAt: Date
    updatedAt: Date
    resolvedAt: Date | null
  }): MemoryConflict {
    return {
      id: row.id,
      userId: row.userId,
      entity: row.entity,
      key: row.key,
      existingValue: row.existingValue,
      incomingValue: row.incomingValue,
      existingSourceRef: row.existingSourceRef,
      incomingSourceRef: row.incomingSourceRef,
      status: row.status === 'resolved' || row.status === 'ignored' ? row.status : 'open',
      severity: row.severity === 'low' || row.severity === 'high' ? row.severity : 'medium',
      confidenceDelta: Number.isFinite(row.confidenceDelta) ? row.confidenceDelta : 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    }
  }

  private normalizeTags(raw: string[] | undefined): string[] {
    if (!Array.isArray(raw)) return []
    const deduped = new Set<string>()
    for (const value of raw) {
      const normalized = typeof value === 'string'
        ? value.trim().toLowerCase().slice(0, 80)
        : ''
      if (!normalized) continue
      deduped.add(normalized)
      if (deduped.size >= 20) break
    }
    return [...deduped]
  }

  private clampConfidence(value: unknown, fallback: number) {
    const numeric = typeof value === 'number' ? value : Number.parseFloat(`${value ?? ''}`)
    if (!Number.isFinite(numeric)) return fallback
    return Math.max(0, Math.min(1, numeric))
  }

  private queryTokens(query: string) {
    return [...new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9_\s-]/g, ' ')
        .split(/\s+/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 2)
        .slice(0, 18),
    )]
  }

  private candidateTokens(values: string[]) {
    return [...new Set(
      values
        .filter((value) => typeof value === 'string' && value.length > 0)
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9_\s-]/g, ' ')
        .split(/\s+/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 3)
        .slice(0, 20),
    )]
  }

  private scoreTextMatch(query: string, tokens: string[], values: string[]) {
    const haystack = values
      .filter((value) => typeof value === 'string' && value.length > 0)
      .join(' ')
      .toLowerCase()

    if (!haystack) return 0

    let score = 0
    const normalizedQuery = query.toLowerCase()
    if (haystack.includes(normalizedQuery)) score += 10
    for (const token of tokens) {
      if (!token) continue
      if (haystack.includes(token)) score += 2
    }
    return score
  }

  private scoreTieredCandidate(input: {
    textScore: number
    confidence: number
    updatedAtIso: string
    freshUntilIso: string | null
    temporalDecayDays: number
  }) {
    if (input.textScore <= 0) return 0
    const recency = this.recencyScore(input.updatedAtIso, input.freshUntilIso, input.temporalDecayDays)
    return input.textScore * 5 + input.confidence * 3 + recency * 2
  }

  private recencyScore(updatedAtIso: string, freshUntilIso: string | null, temporalDecayDays: number) {
    const updatedTs = new Date(updatedAtIso).getTime()
    if (!Number.isFinite(updatedTs)) return 0
    const ageDays = Math.max(0, (Date.now() - updatedTs) / (24 * 60 * 60 * 1000))
    let score = Math.max(0, 1 - ageDays / Math.max(MIN_QUERY_TEMPORAL_DECAY_DAYS, temporalDecayDays))
    if (freshUntilIso) {
      const freshUntilTs = new Date(freshUntilIso).getTime()
      if (Number.isFinite(freshUntilTs) && freshUntilTs >= Date.now()) {
        score = Math.min(1.5, score + 0.35)
      }
    }
    return score
  }

  private selectTieredCandidates<T>(
    ranked: Array<TieredRankedCandidate<T>>,
    limit: number,
    diversify: boolean,
  ) {
    if (!diversify) return ranked.slice(0, limit)

    const remaining = [...ranked]
    const selected: Array<TieredRankedCandidate<T>> = []

    while (remaining.length > 0 && selected.length < limit) {
      let bestIndex = 0
      let bestScore = Number.NEGATIVE_INFINITY

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index]
        const redundancy = selected.length === 0
          ? 0
          : Math.max(...selected.map((picked) => this.diversityPenalty(candidate, picked)))
        const adjusted = candidate.score - redundancy * 4
        if (adjusted > bestScore) {
          bestScore = adjusted
          bestIndex = index
        }
      }

      selected.push(remaining.splice(bestIndex, 1)[0])
    }

    return selected
  }

  private diversityPenalty<T>(
    candidate: TieredRankedCandidate<T>,
    picked: TieredRankedCandidate<T>,
  ) {
    let penalty = 0
    if (candidate.anchor && picked.anchor && candidate.anchor === picked.anchor) {
      penalty += 0.65
    }

    if (candidate.tokens.length === 0 || picked.tokens.length === 0) {
      return Math.min(1, penalty)
    }

    const pickedTokens = new Set(picked.tokens)
    const shared = candidate.tokens.filter((token) => pickedTokens.has(token)).length
    const overlap = shared / Math.max(candidate.tokens.length, picked.tokens.length, 1)
    return Math.min(1, penalty + overlap * 0.75)
  }

  private normalizeTemporalDecayDays(raw: number | undefined) {
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(`${raw ?? ''}`, 10)
    if (!Number.isFinite(parsed)) return DEFAULT_QUERY_TEMPORAL_DECAY_DAYS
    return Math.max(MIN_QUERY_TEMPORAL_DECAY_DAYS, Math.min(MAX_QUERY_TEMPORAL_DECAY_DAYS, Math.trunc(parsed)))
  }

  private effectiveConfidence(
    base: number,
    updatedAt: Date,
    reinforcedAt: Date | null,
    freshUntil: Date | null,
  ) {
    const clampedBase = this.clampConfidence(base, DEFAULT_MEMORY_EVENT_CONFIDENCE)
    const lastSignalAt = reinforcedAt && reinforcedAt > updatedAt ? reinforcedAt : updatedAt
    const ageDays = Math.max(0, (Date.now() - lastSignalAt.getTime()) / (24 * 60 * 60 * 1000))
    let decayFactor = Math.exp(-ageDays / MEMORY_DECAY_DAYS)
    if (freshUntil && freshUntil.getTime() >= Date.now()) {
      decayFactor = Math.min(1, decayFactor + 0.2)
    }
    if (freshUntil && freshUntil.getTime() < Date.now()) {
      decayFactor *= 0.7
    }
    const effective = clampedBase * decayFactor
    return Number(Math.max(0, Math.min(1, effective)).toFixed(4))
  }

  private resolveFreshUntil(rawIso: string | undefined, freshnessHours: number | undefined) {
    const explicit = this.normalizeDate(rawIso)
    if (explicit) return explicit
    const parsedHours = Number.parseInt(`${freshnessHours ?? ''}`, 10)
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) return null
    const boundedHours = Math.max(1, Math.min(parsedHours, 24 * 365))
    return new Date(Date.now() + boundedHours * 60 * 60 * 1000)
  }

  private normalizeDate(value: string | undefined) {
    if (!value) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }

  private conflictSeverity(existingValue: string, incomingValue: string): 'low' | 'medium' | 'high' {
    const existing = existingValue.trim().toLowerCase()
    const incoming = incomingValue.trim().toLowerCase()
    if (!existing || !incoming) return 'medium'
    if (existing === incoming) return 'low'

    const sharedTokens = new Set(existing.split(/\s+/).filter(Boolean))
    let overlap = 0
    for (const token of incoming.split(/\s+/)) {
      if (sharedTokens.has(token)) overlap += 1
    }
    const incomingTokens = incoming.split(/\s+/).filter(Boolean).length || 1
    const overlapRatio = overlap / incomingTokens
    if (overlapRatio <= 0.15) return 'high'
    if (overlapRatio <= 0.5) return 'medium'
    return 'low'
  }

  private parseRecordJson(raw: string | null, context: string): Record<string, unknown> | null {
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return parsed as Record<string, unknown>
    } catch {
      this.logger.warn(`Invalid JSON in ${context}.`)
      return null
    }
  }

  private safeSerialize(value: unknown) {
    try {
      return JSON.stringify(value) ?? ''
    } catch {
      return String(value)
    }
  }

  private normalizeMemoryKey(value: string) {
    return value
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[`"'.,!?;:()[\]{}]/g, '')
      .trim()
      .slice(0, 220)
  }

  private parseTags(raw: string, memoryId: string): string[] {
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((tag) => typeof tag === 'string')
    } catch {
      this.logger.warn(`Memory ${memoryId} has invalid tags JSON. Returning empty tags.`)
      return []
    }
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }

  private normalizeIso(value: unknown) {
    const raw = this.optionalText(value)
    if (!raw) return null
    const date = new Date(raw)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }
}
