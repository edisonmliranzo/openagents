import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TasksService } from '../tasks/tasks.service'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
  ) {}

  list(userId: string, status?: string) {
    return this.prisma.agentQuestion.findMany({
      where: { userId, ...(status ? { status } : { status: { not: 'expired' } }) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  async answer(userId: string, id: string, answer: string) {
    const text = String(answer ?? '').trim()
    if (!text) throw new BadRequestException('Write an answer first.')
    const q = await this.prisma.agentQuestion.findFirst({ where: { id, userId } })
    if (!q) throw new NotFoundException('Question not found')
    if (q.status !== 'open') throw new BadRequestException('Question already resolved')

    await this.prisma.agentQuestion.update({
      where: { id },
      data: { answer: text.slice(0, 2000), status: 'answered', answeredAt: new Date() },
    })

    // Unpause the waiting task with the answer in hand, then re-drive it.
    const task = await this.prisma.agentTask.findFirst({ where: { id: q.taskId, userId } })
    if (task && task.status === 'awaiting_input') {
      const plan = JSON.parse(task.plan || '[]') as Array<Record<string, unknown>>
      const step = plan[task.cursor]
      if (step) {
        step.answer = text.slice(0, 2000)
        step.status = 'done'
        step.output = `User answered: ${text.slice(0, 2000)}`
        await this.prisma.agentTask.update({
          where: { id: task.id },
          data: { plan: JSON.stringify(plan), status: 'running', cursor: task.cursor + 1 },
        })
        await this.prisma.agentTaskEvent.create({
          data: { taskId: task.id, kind: 'answered', message: `Answered: ${text.slice(0, 200)}` },
        })
        void this.notifications.create(task.userId, 'Task resumed', `The agent continued "${task.title}" with your answer.`, 'info').catch(() => undefined)
        void this.tasks.resume(task.id)
      }
    }
    return { ok: true }
  }

  async dismiss(userId: string, id: string) {
    const q = await this.prisma.agentQuestion.findFirst({ where: { id, userId } })
    if (!q) throw new NotFoundException('Question not found')
    await this.prisma.agentQuestion.update({ where: { id }, data: { status: 'expired' } })
    return { ok: true }
  }
}
