import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface SearchSnippetPart {
  text: string
  match: boolean
}

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string | null
  role: string
  content: string
  snippet: string
  snippetParts: SearchSnippetPart[]
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

interface FullTextRow {
  messageId: string
  conversationId: string
  conversationTitle: string | null
  role: string
  content: string
  snippet: string
  matchScore: number
  createdAt: Date
}

/** Markers used by ts_headline to delimit the matched terms. */
const HIGHLIGHT_START = '\u27e6'
const HIGHLIGHT_END = '\u27e7'

const FULLTEXT_OPTIONS = [
  `StartSel=${HIGHLIGHT_START}`,
  `StopSel=${HIGHLIGHT_END}`,
  'MaxWords=35',
  'MinWords=15',
  'ShortWord=3',
  'MaxFragments=1',
  'FragmentDelimiter=...',
].join(', ')

@Injectable()
export class ConversationSearchService implements OnModuleInit {
  private readonly logger = new Logger(ConversationSearchService.name)
  private indexEnsured = false

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureFullTextIndex()
  }

  /**
   * Creates the GIN index that powers `to_tsvector` matching. It is idempotent
   * and safe to run on every boot — the statement is a no-op once the index
   * exists. Failures are logged but never block startup.
   */
  private async ensureFullTextIndex() {
    if (this.indexEnsured) return
    if ((process.env.DISABLE_SEARCH_INDEX_BOOTSTRAP ?? '').trim().toLowerCase() === 'true') return

    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "Message_content_fulltext_idx" ON "Message" USING GIN (to_tsvector('english', "content"))`,
      )
      this.indexEnsured = true
    } catch (error: any) {
      this.logger.warn(
        `Could not create the message full-text index (search still works, but slower): ${error?.message ?? error}`,
      )
    }
  }

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

    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100))
    const safeOffset = Math.max(0, Number(offset) || 0)

    try {
      return await this.searchFullText({
        query,
        userId,
        conversationId,
        role,
        limit: safeLimit,
        offset: safeOffset,
        dateFrom,
        dateTo,
      })
    } catch (error: any) {
      this.logger.warn(
        `Full-text search unavailable, falling back to substring scan: ${error?.message ?? error}`,
      )
      return this.searchSubstring({
        query,
        userId,
        conversationId,
        role,
        limit: safeLimit,
        offset: safeOffset,
        dateFrom,
        dateTo,
      })
    }
  }

  private buildFilters(options: {
    userId: string
    conversationId?: string
    role?: string
    dateFrom?: string
    dateTo?: string
  }): Prisma.Sql[] {
    const filters: Prisma.Sql[] = [Prisma.sql`c."userId" = ${options.userId}`]

    if (options.conversationId) {
      filters.push(Prisma.sql`m."conversationId" = ${options.conversationId}`)
    }
    if (options.role) {
      filters.push(Prisma.sql`m.role = ${options.role}`)
    }
    if (options.dateFrom) {
      filters.push(Prisma.sql`m."createdAt" >= ${new Date(options.dateFrom)}`)
    }
    if (options.dateTo) {
      filters.push(Prisma.sql`m."createdAt" <= ${new Date(options.dateTo)}`)
    }

    return filters
  }

  private async searchFullText(options: {
    query: string
    userId: string
    conversationId?: string
    role?: 'user' | 'agent' | 'tool'
    limit: number
    offset: number
    dateFrom?: string
    dateTo?: string
  }): Promise<{ results: SearchResult[]; total: number }> {
    const filters = this.buildFilters(options)
    const where = Prisma.join(filters, ' AND ')

    const rows = await this.prisma.$queryRaw<FullTextRow[]>(Prisma.sql`
      SELECT
        m.id AS "messageId",
        m."conversationId" AS "conversationId",
        c.title AS "conversationTitle",
        m.role AS role,
        m.content AS content,
        ts_headline('english', m.content, plainto_tsquery('english', ${options.query}), ${FULLTEXT_OPTIONS}) AS snippet,
        ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', ${options.query}))::float8 AS "matchScore",
        m."createdAt" AS "createdAt"
      FROM "Message" m
      JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', ${options.query})
        AND ${where}
      ORDER BY "matchScore" DESC, m."createdAt" DESC
      LIMIT ${Prisma.raw(String(options.limit))} OFFSET ${Prisma.raw(String(options.offset))}
    `)

    const counts = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "Message" m
      JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', ${options.query})
        AND ${where}
    `)

    const total = Number(counts?.[0]?.count ?? 0)

    return {
      results: rows.map((row) => this.toResult(row, options.query)),
      total,
    }
  }

  /**
   * Portable fallback for environments where the Postgres full-text functions
   * are unavailable. Still searches the *whole* history (no arbitrary 200-row
   * window) and scores matches by how many terms hit.
   */
  private async searchSubstring(options: {
    query: string
    userId: string
    conversationId?: string
    role?: 'user' | 'agent' | 'tool'
    limit: number
    offset: number
    dateFrom?: string
    dateTo?: string
  }): Promise<{ results: SearchResult[]; total: number }> {
    const terms = options.query.toLowerCase().split(/\s+/).filter(Boolean)

    const whereClause: Prisma.MessageWhereInput = {
      conversation: { userId: options.userId },
      content: { not: '' },
      OR: terms.map((term) => ({ content: { contains: term, mode: 'insensitive' as const } })),
    }

    if (options.conversationId) whereClause.conversationId = options.conversationId
    if (options.role) whereClause.role = options.role
    if (options.dateFrom || options.dateTo) {
      whereClause.createdAt = {}
      if (options.dateFrom) whereClause.createdAt.gte = new Date(options.dateFrom)
      if (options.dateTo) whereClause.createdAt.lte = new Date(options.dateTo)
    }

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: whereClause,
        include: { conversation: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      this.prisma.message.count({ where: whereClause }),
    ])

    const results = messages
      .map((msg) => {
        const content = (msg.content ?? '').toLowerCase()
        const matchedTerms = terms.filter((term) => content.includes(term))
        const matchScore = terms.length > 0 ? matchedTerms.length / terms.length : 0
        const { snippet, parts } = this.buildSnippet(msg.content ?? '', terms)

        return {
          messageId: msg.id,
          conversationId: msg.conversationId,
          conversationTitle: msg.conversation?.title ?? null,
          role: msg.role,
          content: (msg.content ?? '').slice(0, 500),
          snippet,
          snippetParts: parts,
          matchScore,
          createdAt: msg.createdAt.toISOString(),
        }
      })
      .sort((a, b) => b.matchScore - a.matchScore)

    return { results, total }
  }

  private toResult(row: FullTextRow, query: string): SearchResult {
    const { snippet, parts } = this.buildSnippet(row.snippet ?? row.content ?? '', query.split(/\s+/))

    return {
      messageId: row.messageId,
      conversationId: row.conversationId,
      conversationTitle: row.conversationTitle ?? null,
      role: row.role,
      content: (row.content ?? '').slice(0, 500),
      snippet,
      snippetParts: parts,
      matchScore: Number(row.matchScore ?? 0),
      createdAt: new Date(row.createdAt).toISOString(),
    }
  }

  /**
   * Produces a plain-text snippet plus a list of parts marking the matched
   * terms. The parts are plain strings (never HTML) so the UI can render the
   * highlights without any risk of injecting markup.
   */
  private buildSnippet(
    source: string,
    terms: string[],
  ): { snippet: string; parts: SearchSnippetPart[] } {
    const parts: SearchSnippetPart[] = []
    const marker = new RegExp(`${HIGHLIGHT_START}([\\s\\S]*?)${HIGHLIGHT_END}`)

    let remaining = source
    let guard = 0

    while (guard < 50) {
      guard += 1
      const match = marker.exec(remaining)
      if (!match) break

      if (match.index > 0) {
        parts.push({ text: remaining.slice(0, match.index), match: false })
      }
      parts.push({ text: match[1], match: true })
      remaining = remaining.slice(match.index + match[0].length)
    }

    if (remaining.length > 0) {
      parts.push({ text: remaining, match: false })
    }

    // No Postgres markers (fallback path) — locate the terms ourselves.
    if (parts.length === 0 || (parts.length === 1 && !parts[0].match)) {
      return this.buildSnippetByTerms(source, terms)
    }

    const snippet = parts.map((part) => part.text).join('').trim()
    return { snippet, parts }
  }

  private buildSnippetByTerms(
    source: string,
    terms: string[],
  ): { snippet: string; parts: SearchSnippetPart[] } {
    const lower = source.toLowerCase()
    const usefulTerms = terms.filter((term) => term.trim().length > 0)
    if (usefulTerms.length === 0) {
      return { snippet: source.slice(0, 200), parts: [{ text: source.slice(0, 200), match: false }] }
    }

    let firstIndex = -1
    for (const term of usefulTerms) {
      const idx = lower.indexOf(term.toLowerCase())
      if (idx >= 0 && (firstIndex < 0 || idx < firstIndex)) firstIndex = idx
    }

    const start = firstIndex < 0 ? 0 : Math.max(0, firstIndex - 60)
    const end = Math.min(source.length, (firstIndex < 0 ? 0 : firstIndex) + 140)
    const window = source.slice(start, end)
    const parts: SearchSnippetPart[] = []

    if (start > 0) parts.push({ text: '...', match: false })

    const lowerWindow = window.toLowerCase()
    let cursor = 0
    let matchedAny = false

    for (const term of usefulTerms) {
      const needle = term.toLowerCase()
      if (!needle) continue
      const idx = lowerWindow.indexOf(needle, cursor)
      if (idx < 0) continue
      matchedAny = true
      if (idx > cursor) parts.push({ text: window.slice(cursor, idx), match: false })
      parts.push({ text: window.slice(idx, idx + needle.length), match: true })
      cursor = idx + needle.length
    }

    if (!matchedAny) {
      parts.length = 0
      parts.push({ text: window, match: false })
    } else if (cursor < window.length) {
      parts.push({ text: window.slice(cursor), match: false })
    }

    if (end < source.length) parts.push({ text: '...', match: false })

    return { snippet: parts.map((part) => part.text).join('').trim(), parts }
  }
}
