import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface PinnedMessage {
  id: string
  messageId: string
  conversationId: string
  userId: string
  note?: string
  pinnedAt: string
}

@Injectable()
export class PinService {
  private readonly logger = new Logger(PinService.name)
  private pins = new Map<string, PinnedMessage>()

  async pin(input: {
    messageId: string
    conversationId: string
    userId: string
    note?: string
  }): Promise<PinnedMessage> {
    // Check for existing pin
    const existing = Array.from(this.pins.values()).find(
      (p) => p.messageId === input.messageId && p.userId === input.userId,
    )
    if (existing) return existing

    const pin: PinnedMessage = {
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      messageId: input.messageId,
      conversationId: input.conversationId,
      userId: input.userId,
      note: input.note,
      pinnedAt: new Date().toISOString(),
    }
    this.pins.set(pin.id, pin)
    return pin
  }

  async unpin(pinId: string): Promise<boolean> {
    return this.pins.delete(pinId)
  }

  async listForConversation(conversationId: string): Promise<PinnedMessage[]> {
    return Array.from(this.pins.values())
      .filter((p) => p.conversationId === conversationId)
      .sort((a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime())
  }

  async listForUser(userId: string, limit = 50): Promise<PinnedMessage[]> {
    return Array.from(this.pins.values())
      .filter((p) => p.userId === userId)
      .sort((a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime())
      .slice(0, limit)
  }
}
