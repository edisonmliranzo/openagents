import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string | null
  role: string
  content: string
  snippet: string
  matchScore: number
  createdAt: string
}

export interface SearchOptions {
  query: string
  userId: string
  conversationId?: string
  role?: 'user' | 'agent' | 'tool'
  limit?: number
  offset?: number
  dateFrom?: string
  dateTo?: string
}

@Injectable()
export class ConversationSearchService {
  private readonly logger = new Logger(ConversationSearchService.name)

  constructor(private prisma: PrismaService) {}

  async search(options: SearchOptions): Promise<{ results: SearchResult[]; total: number }> {
    const {
      query,
      userId,
      conversationId,
      role,
      limit = 20,
      offset = 0,
      dateFrom,
      dateTo,
    } = options

    if (!query.trim()) {
      return { results: [], total: 0 }
    }

    const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean)

    // Use Prisma full-text search with PostgreSQL
    const whereClause: any = {
      conversation: { userId },
      content: { not: '' },
    }

    if (conversationId) whereClause.conversationId = conversationId
    if (role) whereClause.role = role
    if (dateFrom || dateTo) {
      whereClause.createdAt = {}
      if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom)
      if (dateTo) whereClause.createdAt.lte = new Date(dateTo)
    }

    try {
      const messages = await this.prisma.message.findMany({
        where: whereClause,
        include: { conversation: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit * 3, 200), // Fetch extra for client-side filtering
        skip: offset,
      })

      // Client-side relevance scoring
      const scored = messages
        .map((msg) => {
          const content = (msg.content ?? '').toLowerCase()
          const matchCount = searchTerms.filter((term) => content.includes(term)).length
          const matchScore = searchTerms.length > 0 ? matchCount / searchTerms.length : 0

          // Build snippet around first match
          const firstMatchIndex = searchTerms.reduce((best, term) => {
            const idx = content.indexOf(term)
            return idx >= 0 && (best < 0 || idx < best) ? idx : best
          }, -1)

          const snippetStart = Math.max(0, firstMatchIndex - 60)
          const snippetEnd = Math.min(content.length, firstMatchIndex + 140)
          const snippet = (msg.content ?? '').slice(snippetStart, snippetEnd).trim()

          return {
            messageId: msg.id,
            conversationId: msg.conversationId,
            conversationTitle: (msg as any).conversation?.title ?? null,
            role: msg.role,
            content: (msg.content ?? '').slice(0, 500),
            snippet: snippet ? (snippetStart > 0 ? `...${snippet}` : snippet) : '',
            matchScore,
            createdAt: msg.createdAt.toISOString(),
          }
        })
        .filter((r) => r.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit)

      return { results: scored, total: scored.length }
    } catch (error) {
      this.logger.error('Conversation search failed', error)
      return { results: [], total: 0 }
    }
  }

  async getRecentMentions(userId: string, keyword: string, limit = 10): Promise<SearchResult[]> {
    const result = await this.search({ query: keyword, userId, limit })
    return result.results
  }
}
