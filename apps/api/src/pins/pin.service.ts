import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface PinnedMessage {
  id: string
  messageId: string
  conversationId: string
  userId: string
  note?: string
  pinnedAt: string
  /** The pinned message's text, so the UI can show it without another fetch. */
  content?: string | null
  conversationTitle?: string | null
}

@Injectable()
export class PinService {
  private readonly logger = new Logger(PinService.name)

  constructor(private prisma: PrismaService) {}

  async pin(input: {
    messageId: string
    conversationId: string
    userId: string
    note?: string
  }): Promise<PinnedMessage> {
    // Pinning twice is a no-op — return the existing pin.
    const existing = await this.prisma.pinnedMessage.findUnique({
      where: { userId_messageId: { userId: input.userId, messageId: input.messageId } },
    })
    if (existing) return this.toPin(existing)

    const pin = await this.prisma.pinnedMessage.create({
      data: {
        userId: input.userId,
        messageId: input.messageId,
        conversationId: input.conversationId,
        note: input.note ?? null,
      },
    })

    this.logger.log(`Pinned message ${input.messageId} for user ${input.userId}`)
    return this.toPin(pin)
  }

  async unpin(pinId: string, userId: string): Promise<boolean> {
    const pin = await this.prisma.pinnedMessage.findFirst({ where: { id: pinId, userId } })
    if (!pin) return false
    await this.prisma.pinnedMessage.delete({ where: { id: pinId } })
    return true
  }

  /** Unpins by message id — used by the chat UI toggle. */
  async unpinMessage(userId: string, messageId: string): Promise<boolean> {
    const pin = await this.prisma.pinnedMessage.findUnique({
      where: { userId_messageId: { userId, messageId } },
    })
    if (!pin) return false
    await this.prisma.pinnedMessage.delete({ where: { id: pin.id } })
    return true
  }

  async listForConversation(conversationId: string, userId: string): Promise<PinnedMessage[]> {
    const pins = await this.prisma.pinnedMessage.findMany({
      where: { conversationId, userId },
      orderBy: { createdAt: 'desc' },
      include: { message: { select: { content: true } } },
    })
    return pins.map((pin) => this.toPin(pin, pin.message?.content))
  }

  async listForUser(userId: string, limit = 50): Promise<PinnedMessage[]> {
    const pins = await this.prisma.pinnedMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 200)),
      include: {
        message: { select: { content: true, conversation: { select: { title: true } } } },
      },
    })
    return pins.map((pin) => this.toPin(pin, pin.message?.content, pin.message?.conversation?.title))
  }

  /** True when the message is pinned by this user. */
  async isPinned(userId: string, messageId: string): Promise<boolean> {
    const pin = await this.prisma.pinnedMessage.findUnique({
      where: { userId_messageId: { userId, messageId } },
      select: { id: true },
    })
    return Boolean(pin)
  }

  private toPin(
    pin: {
      id: string
      userId: string
      messageId: string
      conversationId: string
      note: string | null
      createdAt: Date
    },
    content?: string | null,
    conversationTitle?: string | null,
  ): PinnedMessage {
    return {
      id: pin.id,
      messageId: pin.messageId,
      conversationId: pin.conversationId,
      userId: pin.userId,
      note: pin.note ?? undefined,
      pinnedAt: pin.createdAt.toISOString(),
      content: content ?? null,
      conversationTitle: conversationTitle ?? null,
    }
  }
}
