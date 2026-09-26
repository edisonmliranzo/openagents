import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { MemoryService } from '../memory/memory.service'
import { LLMService } from '../agent/llm.service'
import type { LLMProvider } from '@openagents/shared'

export interface ReflectionResult {
  userId: string
  skipped: boolean
  facts: number
  events: number
  reason?: string
}

const REFLECTION_INTERVAL_MS = 6 * 60 * 60 * 1000
const MAX_USERS_PER_CYCLE = 10
const MIN_MESSAGES = 8

const REFLECTION_PROMPT = `You are the long-term memory curator for a personal AI assistant.
From the conversation log below, extract ONLY durable, useful knowledge about the user:
- facts: stable personal/professional facts, preferences, contacts, projects (entity = person/project/user, key = short slug, value = one sentence)
- events: notable completed actions or decisions worth remembering (kind = conversation|workflow|note, summary = one sentence)
Ignore greetings, small talk, and anything already trivial. Return STRICT JSON only:
{"facts":[{"entity":"...","key":"...","value":"..."}],"events":[{"kind":"note","summary":"..."}]}
If nothing is worth keeping, return {"facts":[],"events":[]}.`

@Injectable()
export class ReflectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReflectionService.name)
  private timer?: NodeJS.Timeout
  private readonly ranByDay = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: MemoryService,
    private readonly llm: LLMService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runScheduledCycle()
    }, REFLECTION_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private enabled(): boolean {
    const raw = (this.config.get<string>('REFLECTION_ENABLED') ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
  }

  async runScheduledCycle(): Promise<number> {
    if (!this.enabled()) return 0
    const dayKey = new Date().toISOString().slice(0, 10)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const activeUsers = await this.prisma.conversation.findMany({
      where: { messages: { some: { createdAt: { gte: since } } } },
      select: { userId: true },
      distinct: ['userId'],
      take: MAX_USERS_PER_CYCLE,
    })

    let ran = 0
    for (const row of activeUsers) {
      const userId = row.userId
      const key = `${userId}:${dayKey}`
      if (this.ranByDay.has(key)) continue
      this.ranByDay.add(key)
      const result = await this.reflect(userId).catch((error: any) => {
        this.logger.warn(`Reflection failed for ${userId}: ${error?.message ?? error}`)
        return null
      })
      if (result && !result.skipped) ran += 1
    }
    if (ran > 0) this.logger.log(`Nightly reflection processed ${ran} user(s).`)
    return ran
  }

  async reflect(userId: string): Promise<ReflectionResult> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const messages = await this.prisma.message.findMany({
      where: { conversation: { userId }, createdAt: { gte: since }, role: { in: ['user', 'agent'] } },
      orderBy: { createdAt: 'asc' },
      take: 240,
      select: { role: true, content: true },
    })

    if (messages.length < MIN_MESSAGES) {
      return { userId, skipped: true, facts: 0, events: 0, reason: 'not enough recent conversation' }
    }

    const log = messages
      .map((m) => `${m.role === 'user' ? 'USER' : 'AGENT'}: ${m.content.slice(0, 500)}`)
      .join('\n')
      .slice(0, 24_000)

    const settings = await this.prisma.userSettings.findUnique({ where: { userId } })
    const provider = (settings?.preferredProvider ?? 'ollama') as LLMProvider

    const response = await this.llm.complete(
      [{ role: 'user', content: `${REFLECTION_PROMPT}\n\n--- CONVERSATION LOG ---\n${log}` }],
      [],
      'Return only valid JSON.',
      provider,
      undefined,
      undefined,
      settings?.preferredModel ?? undefined,
    )

    const parsed = this.extractJson(response.content)
    if (!parsed) {
      return { userId, skipped: true, facts: 0, events: 0, reason: 'model did not return parseable JSON' }
    }

    let facts = 0
    let events = 0
    const factList = Array.isArray(parsed.facts) ? (parsed.facts as Array<Record<string, unknown>>).slice(0, 12) : []
    const eventList = Array.isArray(parsed.events) ? (parsed.events as Array<Record<string, unknown>>).slice(0, 8) : []
    for (const fact of factList) {
      const entity = typeof fact.entity === 'string' ? fact.entity.trim() : ''
      const key = typeof fact.key === 'string' ? fact.key.trim() : ''
      const value = typeof fact.value === 'string' ? fact.value.trim() : ''
      if (!entity || !key || !value) continue
      await this.memory
        .upsertFact(userId, { entity, key, value, confidence: 0.85, sourceRef: 'reflection' })
        .catch(() => undefined)
      facts += 1
    }
    for (const event of eventList) {
      const summary = typeof event.summary === 'string' ? event.summary.trim() : ''
      if (!summary) continue
      const kind = event.kind === 'conversation' || event.kind === 'workflow' ? event.kind : 'note'
      await this.memory
        .writeEvent(userId, { kind, summary, confidence: 0.8, sourceRef: 'reflection' })
        .catch(() => undefined)
      events += 1
    }

    this.logger.log(`Reflection for ${userId}: ${facts} facts, ${events} events.`)
    return { userId, skipped: false, facts, events }
  }

  private extractJson(text: string): { facts?: unknown[]; events?: unknown[] } | null {
    const raw = (text ?? '').trim()
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const candidates = [fenced?.[1], raw].filter((v): v is string => typeof v === 'string' && v.length > 0)
    for (const candidate of candidates) {
      const start = candidate.indexOf('{')
      const end = candidate.lastIndexOf('}')
      if (start === -1 || end <= start) continue
      try {
        const parsed: unknown = JSON.parse(candidate.slice(start, end + 1))
        if (parsed && typeof parsed === 'object') {
          return parsed as { facts?: unknown[]; events?: unknown[] }
        }
      } catch {
        // try next candidate
      }
    }
    return null
  }
}
