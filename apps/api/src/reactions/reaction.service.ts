import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface MessageReaction {
  id: string
  messageId: string
  conversationId: string
  userId: string
  emoji: string
  createdAt: string
}

export const ALLOWED_REACTIONS = ['👍', '👎', '❤️', '🔥', '💡', '🎯', '⚡', '🤔', '✅', '❌', '📌', '⭐']

@Injectable()
export class ReactionService {
  private readonly logger = new Logger(ReactionService.name)

  constructor(private prisma: PrismaService) {}

  async add(input: {
    messageId: string
    conversationId: string
    userId: string
    emoji: string
  }): Promise<MessageReaction> {
    if (!ALLOWED_REACTIONS.includes(input.emoji)) {
      throw new BadRequestException(
        `Reaction "${input.emoji}" is not allowed. Use: ${ALLOWED_REACTIONS.join(' ')}`,
      )
    }

    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        userId_messageId_emoji: {
          userId: input.userId,
          messageId: input.messageId,
          emoji: input.emoji,
        },
      },
    })
    if (existing) return this.toReaction(existing)

    const reaction = await this.prisma.messageReaction.create({
      data: {
        userId: input.userId,
        messageId: input.messageId,
        conversationId: input.conversationId,
        emoji: input.emoji,
      },
    })

    this.logger.log(`${input.userId} reacted ${input.emoji} to ${input.messageId}`)
    return this.toReaction(reaction)
  }

  async remove(reactionId: string, userId: string): Promise<boolean> {
    const reaction = await this.prisma.messageReaction.findFirst({ where: { id: reactionId, userId } })
    if (!reaction) return false
    await this.prisma.messageReaction.delete({ where: { id: reactionId } })
    return true
  }

  /** Toggles a reaction: adds it when missing, removes it when present. */
  async toggle(input: {
    messageId: string
    conversationId: string
    userId: string
    emoji: string
  }): Promise<{ active: boolean; counts: Record<string, number> }> {
    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        userId_messageId_emoji: {
          userId: input.userId,
          messageId: input.messageId,
          emoji: input.emoji,
        },
      },
    })

    if (existing) {
      await this.prisma.messageReaction.delete({ where: { id: existing.id } })
    } else {
      await this.add(input)
    }

    return {
      active: !existing,
      counts: await this.getReactionCounts(input.messageId),
    }
  }

  async listForMessage(messageId: string): Promise<MessageReaction[]> {
    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    })
    return reactions.map((r) => this.toReaction(r))
  }

  async getReactionCounts(messageId: string): Promise<Record<string, number>> {
    const grouped = await this.prisma.messageReaction.groupBy({
      by: ['emoji'],
      where: { messageId },
      _count: { _all: true },
    })

    const counts: Record<string, number> = {}
    for (const row of grouped) {
      counts[row.emoji] = row._count._all
    }
    return counts
  }

  /** The caller's own reactions on a message — used to render the toggle state. */
  async getUserReactions(userId: string, messageId: string): Promise<string[]> {
    const rows = await this.prisma.messageReaction.findMany({
      where: { userId, messageId },
      select: { emoji: true },
    })
    return rows.map((r) => r.emoji)
  }

  getAllowedReactions(): string[] {
    return ALLOWED_REACTIONS
  }

  private toReaction(reaction: {
    id: string
    userId: string
    messageId: string
    conversationId: string
    emoji: string
    createdAt: Date
  }): MessageReaction {
    return {
      id: reaction.id,
      messageId: reaction.messageId,
      conversationId: reaction.conversationId,
      userId: reaction.userId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt.toISOString(),
    }
  }
}
