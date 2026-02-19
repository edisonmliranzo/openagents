import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { SessionPatchInput, SessionPatchResult, SessionRow, SessionsListResult } from '@openagents/shared'
import { PrismaService } from '../prisma/prisma.service'

export interface ListSessionsParams {
  activeMinutes?: number
  limit?: number
  includeGlobal?: boolean
  includeUnknown?: boolean
}

interface TokenCounts {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string, params: ListSessionsParams = {}): Promise<SessionsListResult> {
    const activeMinutes = this.toPositiveInt(params.activeMinutes)
    const limit = this.toPositiveInt(params.limit)
    const includeGlobal = params.includeGlobal ?? true
    const includeUnknown = params.includeUnknown ?? false

    const now = Date.now()
    const where: any = { userId }
    if (activeMinutes > 0) {
      where.OR = [
        { lastMessageAt: { gte: new Date(now - activeMinutes * 60 * 1000) } },
        { lastMessageAt: null, createdAt: { gte: new Date(now - activeMinutes * 60 * 1000) } },
      ]
    }

    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      ...(limit > 0 ? { take: limit } : {}),
    })

    const tokenMap = await this.getTokenMap(conversations.map((conversation) => conversation.id))
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } })

    const sessions: SessionRow[] = conversations.map((conversation) => {
      const counts = tokenMap.get(conversation.id) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      return this.toSessionRow(conversation, counts, settings)
    })

    // These flags are accepted for OpenClaw-compatible API shape.
    // Current MVP session store only materializes direct user conversations.
    void includeGlobal
    void includeUnknown

    return {
      ts: Date.now(),
      path: 'database:conversation',
      count: sessions.length,
      defaults: {
        model: settings?.preferredModel ?? null,
        contextTokens: null,
      },
      sessions,
    }
  }

  async patch(conversationId: string, userId: string, patch: SessionPatchInput): Promise<SessionPatchResult> {
    const existing = await this.prisma.conversation.findUnique({ where: { id: conversationId } })
    if (!existing) throw new NotFoundException('Session not found')
    if (existing.userId !== userId) throw new ForbiddenException()

    const data: Record<string, string | null> = {}
    if ('label' in patch) data.sessionLabel = this.normalizeNullable(patch.label)
    if ('thinkingLevel' in patch) data.thinkingLevel = this.normalizeNullable(patch.thinkingLevel)
    if ('verboseLevel' in patch) data.verboseLevel = this.normalizeNullable(patch.verboseLevel)
    if ('reasoningLevel' in patch) data.reasoningLevel = this.normalizeNullable(patch.reasoningLevel)

    const updated = Object.keys(data).length
      ? await this.prisma.conversation.update({ where: { id: conversationId }, data })
      : existing

    const tokenMap = await this.getTokenMap([updated.id])
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } })
    const row = this.toSessionRow(updated, tokenMap.get(updated.id), settings)

    return { ok: true, session: row }
  }

  async delete(conversationId: string, userId: string) {
    const existing = await this.prisma.conversation.findUnique({ where: { id: conversationId } })
    if (!existing) throw new NotFoundException('Session not found')
    if (existing.userId !== userId) throw new ForbiddenException()
    await this.prisma.conversation.delete({ where: { id: conversationId } })
  }

  private toPositiveInt(value: unknown) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return 0
    return parsed
  }

  private normalizeNullable(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }

  private estimateTokens(text: string) {
    return Math.max(0, Math.ceil(text.length / 4))
  }

  private async getTokenMap(conversationIds: string[]) {
    const tokenMap = new Map<string, TokenCounts>()
    if (!conversationIds.length) return tokenMap

    const messages = await this.prisma.message.findMany({
      where: { conversationId: { in: conversationIds } },
      select: {
        conversationId: true,
        role: true,
        content: true,
      },
    })

    for (const message of messages) {
      const current = tokenMap.get(message.conversationId) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      const tokens = this.estimateTokens(message.content)
      if (message.role === 'agent') {
        current.outputTokens += tokens
      } else {
        current.inputTokens += tokens
      }
      current.totalTokens += tokens
      tokenMap.set(message.conversationId, current)
    }

    return tokenMap
  }

  private toSessionRow(
    conversation: {
      id: string
      title: string | null
      sessionLabel: string | null
      thinkingLevel: string | null
      verboseLevel: string | null
      reasoningLevel: string | null
      lastMessageAt: Date | null
      createdAt: Date
    },
    counts?: TokenCounts,
    settings?: { preferredModel: string; preferredProvider: string } | null,
  ): SessionRow {
    const tokenCounts = counts ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    return {
      id: conversation.id,
      sessionId: conversation.id,
      key: `agent:main:${conversation.id.slice(0, 8)}`,
      kind: 'direct',
      label: conversation.sessionLabel,
      displayName: conversation.title,
      updatedAt: (conversation.lastMessageAt ?? conversation.createdAt).getTime(),
      thinkingLevel: conversation.thinkingLevel,
      verboseLevel: conversation.verboseLevel,
      reasoningLevel: conversation.reasoningLevel,
      inputTokens: tokenCounts.inputTokens,
      outputTokens: tokenCounts.outputTokens,
      totalTokens: tokenCounts.totalTokens,
      model: settings?.preferredModel ?? null,
      modelProvider: settings?.preferredProvider ?? null,
      contextTokens: null,
    }
  }
}
