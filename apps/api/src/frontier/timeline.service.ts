import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { clamp } from './frontier.util'

export interface TimelineHit {
  id: string
  date: string
  kind: 'memory' | 'summary' | 'message'
  text: string
  score: number
  conversationId?: string | null
}

const STOPWORDS = new Set(['the','a','an','and','or','but','is','was','were','are','be','to','of','in','on','for','with','at','by','from','i','you','it','this','that','we','they','he','she','my','your','do','did','about','what','when'])

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async embed(text: string): Promise<number[] | null> {
    try {
      const base = (this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434').trim()
      const res = await fetch(`${base.replace(/\/$/, '')}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', prompt: text.slice(0, 2000) }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return null
      const json: any = await res.json()
      return Array.isArray(json?.embedding) && json.embedding.length ? json.embedding : null
    } catch {
      return null
    }
  }

  private tokens(text: string): Set<string> {
    return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t)))
  }

  private cosine(a: number[], b: number[]): number {
    let dot = 0
    let na = 0
    let nb = 0
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i += 1) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return na && nb ? dot / Math.sqrt(na * nb) : 0
  }

  async query(userId: string, input: { q?: string; from?: string; to?: string; limit?: number }): Promise<TimelineHit[]> {
    const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 100)
    const gte = input.from ? new Date(input.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const lte = input.to ? new Date(input.to) : new Date()
    if (Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime())) return []

    const q = (input.q ?? '').trim()
    const qTokens = q ? this.tokens(q) : new Set<string>()

    const [memories, summaries, messages] = await Promise.all([
      this.prisma.memory.findMany({ where: { userId, createdAt: { gte, lte } }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.conversationSummary.findMany({ where: { userId, createdAt: { gte, lte } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.message.findMany({
        where: { role: { in: ['user', 'agent'] }, createdAt: { gte, lte }, conversation: { userId } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ])

    const items: TimelineHit[] = [
      ...memories.map((m) => ({ id: m.id, date: m.createdAt.toISOString(), kind: 'memory' as const, text: m.content, score: 0 })),
      ...summaries.map((s) => ({ id: s.id, date: s.createdAt.toISOString(), kind: 'summary' as const, text: s.summary, score: 0, conversationId: s.conversationId })),
      ...messages.map((m) => ({ id: m.id, date: m.createdAt.toISOString(), kind: 'message' as const, text: m.content, score: 0, conversationId: m.conversationId })),
    ]

    for (const item of items) {
      const overlap = qTokens.size
        ? [...this.tokens(item.text)].filter((t) => qTokens.has(t)).length / Math.max(qTokens.size, 1)
        : 0
      const recency = 1 - Math.min(1, (lte.getTime() - new Date(item.date).getTime()) / Math.max(1, lte.getTime() - gte.getTime()))
      item.score = overlap * 2 + recency * 0.5
    }

    if (q) {
      const qVec = await this.embed(q)
      if (qVec) {
        const top = items.filter((i) => i.score > 0).slice(0, 60)
        const pool = top.length ? top : items.slice(0, 60)
        const vectors = await Promise.all(pool.map((i) => this.embed(i.text)))
        pool.forEach((item, idx) => {
          const v = vectors[idx]
          if (v) item.score += this.cosine(qVec, v) * 3
        })
      }
    }

    return items
      .sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1))
      .slice(0, limit)
      .map((i) => ({ ...i, text: clamp(i.text, 240) }))
  }
}
