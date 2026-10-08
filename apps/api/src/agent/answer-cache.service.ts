import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { EmbeddingService } from '../memory/embedding.service'
import { cosineSimilarity, parseEmbedding } from './embeddings'

const CACHE_TTL_HOURS = 24
const FRESH_TTL_MINUTES = 15
const CACHE_THRESHOLD = 0.94
const CACHE_MAX_ROWS_PER_USER = 500
const CACHE_MAX_ANSWER_CHARS = 1500
const CACHEABLE_CLASSES = new Set(['small-talk', 'general', 'summarize'])
// Time-sensitive answers (news, prices, scores) cache briefly so "what's the
// news" twice in 15 minutes dedupes, but stale news never survives.
const FRESH_CLASSES = new Set(['search'])

export interface CachedAnswer {
  id: string
  answer: string
  provider: string
  model: string | null
  score: number
}

@Injectable()
export class AnswerCacheService {
  private readonly logger = new Logger(AnswerCacheService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    const raw = (this.config.get<string>('ANSWER_CACHE') ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
  }

  /**
   * Look for a recent, semantically-near cached answer. Stable classes use a
   * 24h window; time-sensitive classes (search) use a 15-minute window.
   * Code and reasoning always run fresh.
   */
  async lookup(userId: string, question: string, taskClass: string): Promise<CachedAnswer | null> {
    const stable = CACHEABLE_CLASSES.has(taskClass)
    const fresh = FRESH_CLASSES.has(taskClass)
    if (!this.enabled || (!stable && !fresh)) return null
    const trimmed = question.trim()
    if (!trimmed || trimmed.length > 400) return null

    const embedded = await this.embeddings.embed(trimmed)
    if (!embedded) return null

    const ttlMs = fresh ? FRESH_TTL_MINUTES * 60 * 1000 : CACHE_TTL_HOURS * 60 * 60 * 1000
    const since = new Date(Date.now() - ttlMs)
    const rows = await this.prisma.answerCache.findMany({
      where: { userId, createdAt: { gte: since }, taskClass },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    let best: CachedAnswer | null = null
    for (const row of rows) {
      const vector = parseEmbedding(row.embedding)
      if (!vector) continue
      const score = cosineSimilarity(embedded.vector, vector)
      if (score >= CACHE_THRESHOLD && (!best || score > best.score)) {
        best = { id: row.id, answer: row.answer, provider: row.provider, model: row.model, score }
      }
    }

    if (best) {
      await this.prisma.answerCache
        .update({ where: { id: best.id }, data: { hits: { increment: 1 }, lastHitAt: new Date() } })
        .catch(() => undefined)
      this.logger.debug(`Cache hit (${best.score.toFixed(3)}): "${best.id}"`)
    }
    return best
  }

  /** Store a clean, tool-free answer for future semantic reuse. */
  async store(input: {
    userId: string
    question: string
    answer: string
    provider: string
    model?: string | null
    taskClass: string
    usedTools: boolean
  }): Promise<void> {
    if (!this.enabled) return
    const stable = CACHEABLE_CLASSES.has(input.taskClass)
    const fresh = FRESH_CLASSES.has(input.taskClass)
    if (!stable && !fresh) return
    // Tool-free for stable answers; tool-backed search answers are cacheable
    // but only live for the short freshness window.
    if (input.usedTools && !fresh) return
    const answer = input.answer.trim()
    if (!answer || answer.length > CACHE_MAX_ANSWER_CHARS) return

    try {
      const embedded = await this.embeddings.embed(input.question.trim())
      if (!embedded) return
      await this.prisma.answerCache.create({
        data: {
          userId: input.userId,
          question: input.question.trim().slice(0, 600),
          answer: answer.slice(0, CACHE_MAX_ANSWER_CHARS),
          embedding: this.embeddings.serialize(embedded.vector),
          provider: input.provider,
          model: input.model ?? null,
          taskClass: input.taskClass,
        },
      })
      // Keep the per-user cache bounded to the freshest rows.
      const stale = await this.prisma.answerCache.findMany({
        where: { userId: input.userId },
        orderBy: { createdAt: 'desc' },
        skip: CACHE_MAX_ROWS_PER_USER,
        select: { id: true },
      })
      if (stale.length > 0) {
        await this.prisma.answerCache.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } })
      }
    } catch (error: any) {
      this.logger.debug(`Cache store skipped: ${error?.message ?? error}`)
    }
  }

  async stats(userId: string) {
    const rows = await this.prisma.answerCache.aggregate({
      where: { userId },
      _count: { id: true },
      _sum: { hits: true },
    })
    return { entries: rows._count.id, totalHits: rows._sum.hits ?? 0 }
  }

  async clear(userId: string) {
    const result = await this.prisma.answerCache.deleteMany({ where: { userId } })
    return { deleted: result.count }
  }
}
