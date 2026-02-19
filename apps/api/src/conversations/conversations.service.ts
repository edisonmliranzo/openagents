import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ConversationsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
    })
  }

  async get(id: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id } })
    if (!conv) throw new NotFoundException()
    if (conv.userId !== userId) throw new ForbiddenException()
    return conv
  }

  async create(userId: string, title?: string) {
    return this.prisma.conversation.create({
      data: { userId, title: title ?? null },
    })
  }

  async messages(conversationId: string, userId: string) {
    await this.get(conversationId, userId)
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async delete(id: string, userId: string) {
    await this.get(id, userId)
    await this.prisma.conversation.delete({ where: { id } })
  }

  async touchLastMessage(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    })
  }
}
