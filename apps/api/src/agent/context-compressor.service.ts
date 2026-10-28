import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from './llm.service'
import { UsersService } from '../users/users.service'
import type { LLMProvider } from '@openagents/shared'

const COMPRESSION_THRESHOLD = 30   // compress when conversation exceeds this many messages
const KEEP_RECENT = 10             // always preserve the most recent N messages verbatim
const SUMMARY_MODEL = 'claude-haiku-4-5-20251001'

@Injectable()
export class ContextCompressorService {
  private readonly logger = new Logger(ContextCompressorService.name)

  constructor(
    private prisma: PrismaService,
    private llm: LLMService,
    private users: UsersService,
  ) {}

  /**
   * Returns a compression summary string to inject at the top of context,
   * creating/updating the stored summary if needed. Returns null when the
   * conversation is short enough not to need compression.
   */
  async getOrCreateSummary(conversationId: string, userId: string): Promise<string | null> {
    const total = await this.prisma.message.count({ where: { conversationId } })
    if (total <= COMPRESSION_THRESHOLD) return null

    // Reuse a recent summary if it covers enough messages
    const existing = await this.prisma.conversationSummary.findFirst({
      where: { conversationId, userId },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) return this.formatSummary(existing.summary, existing.keyTopics)

    // Never block the active chat request waiting for a summary LLM call;
    // generate the summary asynchronously in the background for the next turn.
    void this.createSummary(conversationId, userId).catch(() => null)
    return null
  }

  async forceCompress(conversationId: string, userId: string): Promise<string> {
    // Delete old summaries so a fresh one is generated
    await this.prisma.conversationSummary.deleteMany({ where: { conversationId, userId } })
    return (await this.createSummary(conversationId, userId)) ?? 'No compressible messages found.'
  }

  private async createSummary(conversationId: string, userId: string): Promise<string | null> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId, role: { in: ['user', 'agent'] } },
      orderBy: { createdAt: 'asc' },
      // Summarise everything except the most recent KEEP_RECENT messages
      take: -(KEEP_RECENT) + 9999, // all but the last KEEP_RECENT — fetch all and slice
    })

    const allMessages = await this.prisma.message.findMany({
      where: { conversationId, role: { in: ['user', 'agent'] } },
      orderBy: { createdAt: 'asc' },
    })

    const toSummarize = allMessages.slice(0, Math.max(0, allMessages.length - KEEP_RECENT))
    if (toSummarize.length === 0) return null

    const transcript = toSummarize
      .map((m) => `${m.role === 'agent' ? 'Assistant' : 'User'}: ${m.content.slice(0, 800)}`)
      .join('\n\n')

    try {
      const settings = await this.users.getSettings(userId).catch(() => null as any)
      const provider = (settings?.preferredProvider ?? 'anthropic') as LLMProvider
      const model = settings?.preferredModel?.trim() || (provider === 'anthropic' ? SUMMARY_MODEL : undefined)
      const userKey = await this.users.getRawLlmKey(userId, provider).catch(() => null)
      const apiKey = userKey?.isActive ? (userKey.apiKey ?? userKey.loginPassword ?? undefined) : undefined
      const baseUrl = userKey?.isActive ? (userKey.baseUrl ?? undefined) : undefined

      const response = await this.llm.complete(
        [{ role: 'user', content: `Summarize the following conversation transcript concisely. Capture: key decisions made, tasks completed, important facts learned, current state of work, and any pending items. Be specific and factual — this summary will replace the full history in future turns.\n\n${transcript}` }],
        [],
        'You are a concise summarizer. Output only the summary text.',
        provider,
        apiKey,
        baseUrl,
        model,
      )

      const summary = response?.content?.trim() ?? ''
      const keyTopics = this.extractTopics(toSummarize.map((m) => m.content).join(' '))

      await this.prisma.conversationSummary.create({
        data: {
          conversationId,
          userId,
          summary,
          keyTopics: JSON.stringify(keyTopics),
          type: 'auto',
          summaryType: 'full',
          model: model ?? SUMMARY_MODEL,
          tokensUsed: null,
        },
      })

      return this.formatSummary(summary, JSON.stringify(keyTopics))
    } catch (err) {
      this.logger.warn(`Context compression failed for ${conversationId}: ${(err as Error).message}`)
      return null
    }
  }

  private formatSummary(summary: string, keyTopicsJson: string): string {
    let topics: string[] = []
    try { topics = JSON.parse(keyTopicsJson) } catch { /* ignore */ }
    const topicsLine = topics.length ? `\nKey topics: ${topics.join(', ')}` : ''
    return `[Conversation summary — earlier messages compressed]\n${summary}${topicsLine}`
  }

  private extractTopics(text: string): string[] {
    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []
    const freq = new Map<string, number>()
    const stopwords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'will', 'they', 'your', 'when', 'what', 'which', 'there', 'their', 'into', 'about', 'also', 'more', 'than', 'some', 'would', 'could', 'should', 'then', 'just', 'like', 'user', 'assistant'])
    for (const word of words) {
      if (!stopwords.has(word)) freq.set(word, (freq.get(word) ?? 0) + 1)
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([word]) => word)
  }
}
