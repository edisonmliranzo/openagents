import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class HandoffService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a shareable, tokenized link to follow a task from any device. */
  async create(userId: string, taskId: string, label?: string, ttlHours = 168) {
    const task = await this.prisma.agentTask.findFirst({ where: { id: taskId, userId }, select: { id: true, title: true } })
    if (!task) throw new NotFoundException('Task not found')
    const link = await this.prisma.handoffLink.create({
      data: {
        userId,
        taskId,
        token: randomBytes(24).toString('base64url'),
        label: String(label ?? task.title).slice(0, 120),
        expiresAt: new Date(Date.now() + Math.min(Math.max(ttlHours, 1), 24 * 30) * 3600_000),
      },
    })
    return { id: link.id, token: link.token, expiresAt: link.expiresAt, path: `/h/${link.token}` }
  }

  list(userId: string) {
    return this.prisma.handoffLink.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }

  /** Public (token-only) read model for the handoff page. */
  async resolve(token: string) {
    const link = await this.prisma.handoffLink.findUnique({ where: { token } })
    if (!link) throw new NotFoundException('Link not found')
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new ForbiddenException('Link expired')
    const task = await this.prisma.agentTask.findUnique({
      where: { id: link.taskId },
      select: {
        title: true, goal: true, status: true, result: true, error: true,
        startedAt: true, finishedAt: true, createdAt: true,
        events: { orderBy: { createdAt: 'asc' }, take: 50, select: { kind: true, message: true, createdAt: true } },
      },
    })
    if (!task) throw new NotFoundException('Task no longer exists')
    await this.prisma.handoffLink.update({ where: { id: link.id }, data: { views: { increment: 1 } } })
    return { label: link.label, task }
  }

  async revoke(userId: string, id: string) {
    const link = await this.prisma.handoffLink.findFirst({ where: { id, userId } })
    if (!link) throw new NotFoundException('Link not found')
    await this.prisma.handoffLink.delete({ where: { id } })
    return { ok: true }
  }

  /** Invalidate every pending open question of a user (e.g. answered elsewhere). */
  async assertTaskOwner(userId: string, taskId: string) {
    const task = await this.prisma.agentTask.findFirst({ where: { id: taskId, userId }, select: { id: true } })
    if (!task) throw new BadRequestException('Task not found')
    return task
  }
}
