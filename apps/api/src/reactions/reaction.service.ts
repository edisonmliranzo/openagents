import { Injectable, Logger } from '@nestjs/common'

export interface MessageReaction {
  id: string
  messageId: string
  conversationId: string
  userId: string
  emoji: string
  createdAt: string
}

const ALLOWED_REACTIONS = ['👍', '👎', '❤️', '🔥', '💡', '🎯', '⚡', '🤔', '✅', '❌', '📌', '⭐']

@Injectable()
export class ReactionService {
  private readonly logger = new Logger(ReactionService.name)
  private reactions = new Map<string, MessageReaction>()

  async add(input: {
    messageId: string
    conversationId: string
    userId: string
    emoji: string
  }): Promise<MessageReaction> {
    if (!ALLOWED_REACTIONS.includes(input.emoji)) {
      throw new Error(`Reaction "${input.emoji}" is not allowed. Use: ${ALLOWED_REACTIONS.join(' ')}`)
    }

    // Prevent duplicate
    const existing = Array.from(this.reactions.values()).find(
      (r) => r.messageId === input.messageId && r.userId === input.userId && r.emoji === input.emoji,
    )
    if (existing) return existing

    const reaction: MessageReaction = {
      id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      messageId: input.messageId,
      conversationId: input.conversationId,
      userId: input.userId,
      emoji: input.emoji,
      createdAt: new Date().toISOString(),
    }
    this.reactions.set(reaction.id, reaction)
    return reaction
  }

  async remove(reactionId: string): Promise<boolean> {
    return this.reactions.delete(reactionId)
  }

  async listForMessage(messageId: string): Promise<MessageReaction[]> {
    return Array.from(this.reactions.values())
      .filter((r) => r.messageId === messageId)
  }

  async getReactionCounts(messageId: string): Promise<Record<string, number>> {
    const reactions = await this.listForMessage(messageId)
    const counts: Record<string, number> = {}
    for (const r of reactions) {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1
    }
    return counts
  }

  getAllowedReactions(): string[] {
    return ALLOWED_REACTIONS
  }
}
