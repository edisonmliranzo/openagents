import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface ReplayDay {
  date: string
  tasks: Array<{ id: string; title: string; status: string; startedAt: Date | null; finishedAt: Date | null }>
  events: Array<{ taskId: string; taskTitle: string; kind: string; message: string; at: Date }>
  journal: Array<{ id: string; tool: string; undone: boolean; taskId: string | null; at: Date }>
  stats: { tasks: number; steps: number; sideEffects: number; undone: number }
}

@Injectable()
export class ReplayService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything the agent did on a day, ordered chronologically for replay. */
  async day(userId: string, dateStr: string): Promise<ReplayDay> {
    const date = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`)
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date. Use YYYY-MM-DD.')
    const end = new Date(date.getTime() + 24 * 3600_000)

    const tasks = await this.prisma.agentTask.findMany({
      where: { userId, OR: [{ startedAt: { gte: date, lt: end } }, { createdAt: { gte: date, lt: end } }] },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, title: true, status: true, startedAt: true, finishedAt: true },
    })
    const taskIds = tasks.map((t) => t.id)
    const titleById = new Map(tasks.map((t) => [t.id, t.title]))

    const [events, journal] = await Promise.all([
      taskIds.length
        ? this.prisma.agentTaskEvent.findMany({
            where: { taskId: { in: taskIds }, createdAt: { gte: date, lt: end } },
            orderBy: { createdAt: 'asc' },
            take: 400,
            select: { taskId: true, kind: true, message: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.prisma.actionJournalEntry.findMany({
        where: { userId, createdAt: { gte: date, lt: end } },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: { id: true, tool: true, undoneAt: true, taskId: true, createdAt: true },
      }),
    ])

    return {
      date: dateStr,
      tasks,
      events: events.map((e) => ({ ...e, taskTitle: titleById.get(e.taskId) ?? 'task' })),
      journal: journal.map((j) => ({ id: j.id, tool: j.tool, undone: Boolean(j.undoneAt), taskId: j.taskId, at: j.createdAt })),
      stats: {
        tasks: tasks.length,
        steps: events.filter((e) => e.kind === 'step_done').length,
        sideEffects: journal.length,
        undone: journal.filter((j) => j.undoneAt).length,
      },
    }
  }
}
