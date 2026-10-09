import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from '../agent/llm.service'
import { MemoryService } from '../memory/memory.service'
import { flag, clamp } from './frontier.util'

const CYCLE_MS = 30 * 60 * 1000

@Injectable()
export class ConsolidationService {
  private readonly logger = new Logger(ConsolidationService.name)
  private timer: NodeJS.Timeout | null = null
  private lastRunDay = ''

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly memory: MemoryService,
  ) {}

  get enabled(): boolean {
    return flag(this.config, 'SLEEP_CONSOLIDATION')
  }

  onModuleInit() {
    if (!this.enabled) return
    this.timer = setInterval(() => void this.maybeRun(), CYCLE_MS)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private async maybeRun() {
    const now = new Date()
    if (now.getHours() !== 3) return
    const day = now.toISOString().slice(0, 10)
    if (this.lastRunDay === day) return
    this.lastRunDay = day
    await this.runForAllUsers().catch((err) => this.logger.warn(`Consolidation cycle failed: ${err?.message ?? err}`))
  }

  async runForAllUsers() {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const users = await this.prisma.message.findMany({
      where: { createdAt: { gte: since }, conversation: { userId: { not: undefined } } },
      distinct: ['conversationId'],
      select: { conversation: { select: { userId: true } } },
      take: 500,
    })
    const userIds = Array.from(new Set(users.map((u) => u.conversation?.userId).filter(Boolean))) as string[]
    const digests: string[] = []
    for (const userId of userIds) {
      const digest = await this.runForUser(userId).catch(() => null)
      if (digest) digests.push(digest)
    }
    return { users: userIds.length, digests: digests.length }
  }

  async runForUser(userId: string): Promise<string | null> {
    const now = new Date()
    const dayKey = now.toISOString().slice(0, 10)
    const existing = await this.prisma.memory.findFirst({
      where: { userId, type: 'summary', tags: { contains: `sleep:${dayKey}` } },
    })
    if (existing && !process.env.FORCE) return existing.content

    const since = new Date(now.getTime() - 26 * 60 * 60 * 1000)
    const messages = await this.prisma.message.findMany({
      where: { createdAt: { gte: since }, role: { in: ['user', 'agent'] }, conversation: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    })
    if (messages.length < 4) return null
    const transcript = messages
      .reverse()
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${clamp(m.content, 240)}`)
      .join('\n')

    const res = await this.llm.complete(
      [{ role: 'user', content: `Today's conversations:\n${transcript}\n\nWrite the sleep digest (<=6 bullets, plain text):` }],
      [],
      `You compress a day of human-AI conversations into durable episodic memory. Output 3-6 short bullets starting with "- ". Keep stable facts, decisions, open loops, and preferences. No advice, no fluff.`,
      'ollama',
    )
    const digest = res.content.trim().slice(0, 2000)
    if (!digest) return null
    await this.memory.upsert(userId, 'summary', digest, ['episodic', 'sleep', `sleep:${dayKey}`])
    return digest
  }

  async latestDigest(userId: string) {
    const row = await this.prisma.memory.findFirst({
      where: { userId, type: 'summary', tags: { contains: 'sleep:' } },
      orderBy: { createdAt: 'desc' },
    })
    return row ? { id: row.id, content: row.content, createdAt: row.createdAt } : null
  }
}
