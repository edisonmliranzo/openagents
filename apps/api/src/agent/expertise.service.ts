import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const TOPICS: Record<string, RegExp> = {
  coding: /\b(code|coding|python|javascript|typescript|react|api|bug|deploy|git|function|script|program)\b/i,
  trading: /\b(trade|trading|crypto|bitcoin|forex|futures|options|bybit|position|portfolio|stock)\b/i,
  marketing: /\b(marketing|seo|content|social media|instagram|tiktok|youtube|brand|audience|campaign)\b/i,
  finance: /\b(budget|invoice|tax|expense|savings|money|finance|bill|income)\b/i,
  health: /\b(workout|training|diet|sleep|health|gym|run|marathon|calorie)\b/i,
  productivity: /\b(task|calendar|schedule|todo|reminder|meeting|deadline|workflow)\b/i,
}

const BEGINNER_MARKERS = /\b(what is|what's|how do i|how to|explain like|i'?m new|beginner|starter|simple|basic|no idea)\b/i
const ADVANCED_MARKERS = /\b(backtest|arbitrage|kubernetes|async|concurrency|derivative|latency|quant|optimi[sz]e|refactor|architecture|benchmark|regression)\b/i

/**
 * Theory-of-mind lite: track the user's sophistication per topic so answers
 * auto-adjust depth and jargon. Levels 1-5, persisted as memory facts.
 */
@Injectable()
export class ExpertiseService {
  private readonly logger = new Logger(ExpertiseService.name)

  constructor(private readonly prisma: PrismaService) {}

  private detectTopics(message: string): string[] {
    return Object.entries(TOPICS)
      .filter(([, pattern]) => pattern.test(message))
      .map(([topic]) => topic)
  }

  async observe(userId: string, userMessage: string): Promise<void> {
    const topics = this.detectTopics(userMessage)
    if (topics.length === 0) return
    const beginner = BEGINNER_MARKERS.test(userMessage)
    const advanced = ADVANCED_MARKERS.test(userMessage)
    if (!beginner && !advanced) return

    for (const topic of topics) {
      try {
        const existing = await this.prisma.memoryFact.findUnique({
          where: { userId_entity_key: { userId, entity: 'expertise', key: `topic:${topic}` } },
        })
        const current = existing ? Number(JSON.parse(existing.value).level) || 3 : 3
        const next = Math.max(1, Math.min(5, current + (advanced ? 1 : -1)))
        const value = JSON.stringify({ level: next, updatedBy: advanced ? 'advanced-signals' : 'beginner-signals' })
        await this.prisma.memoryFact.upsert({
          where: { userId_entity_key: { userId, entity: 'expertise', key: `topic:${topic}` } },
          create: { userId, entity: 'expertise', key: `topic:${topic}`, value, confidence: 0.7 },
          update: { value, reinforcedAt: new Date() },
        })
      } catch (error: any) {
        this.logger.debug(`Expertise observe failed for ${topic}: ${error?.message ?? error}`)
      }
    }
  }

  async summaryForPrompt(userId: string): Promise<string> {
    try {
      const rows = await this.prisma.memoryFact.findMany({
        where: { userId, entity: 'expertise' },
        take: 20,
      })
      if (rows.length === 0) return ''
      const lines = rows
        .map((row) => {
          try {
            const topic = row.key.replace(/^topic:/, '')
            const level = Number(JSON.parse(row.value).level) || 3
            const label = level <= 2 ? 'beginner' : level === 3 ? 'intermediate' : level === 4 ? 'advanced' : 'expert'
            return `- ${topic}: ${label} (level ${level}/5)`
          } catch {
            return null
          }
        })
        .filter((line): line is string => Boolean(line))
      if (lines.length === 0) return ''
      return `User expertise (calibrate depth and jargon accordingly):\n${lines.join('\n')}`
    } catch {
      return ''
    }
  }
}
