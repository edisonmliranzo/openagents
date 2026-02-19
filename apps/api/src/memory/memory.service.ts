import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name)

  constructor(
    private prisma: PrismaService,
  ) {}

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
}
