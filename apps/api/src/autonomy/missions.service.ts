import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TasksService } from '../tasks/tasks.service'
import { isMissionDue, nextRunAfter } from './autonomy-logic'

const MAX_INTERVAL_HOURS = 24 * 30

@Injectable()
export class MissionsService implements OnModuleInit {
  private readonly logger = new Logger(MissionsService.name)
  /** Missions whose run-task is currently driving in this process. */
  private readonly driving = new Set<string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  /** Resume missions that were due while the process was down. */
  onModuleInit() {
    setTimeout(() => void this.tick(), 5000)
    // Periodic tick: cheap query every 5 minutes.
    setInterval(() => void this.tick(), 5 * 60_000).unref?.()
  }

  create(userId: string, input: { title?: string; goal: string; successCriteria?: string; intervalHours?: number }) {
    const goal = String(input.goal ?? '').trim()
    if (goal.length < 8) throw new BadRequestException('Describe the mission goal in at least a sentence.')
    const intervalHours = Math.max(1, Math.min(Number(input.intervalHours) || 24, MAX_INTERVAL_HOURS))
    return this.prisma.mission.create({
      data: {
        userId,
        title: String(input.title ?? goal).trim().slice(0, 120),
        goal: goal.slice(0, 2000),
        successCriteria: String(input.successCriteria ?? '').trim().slice(0, 1000),
        intervalHours,
        nextRunAt: nextRunAfter(new Date(), intervalHours),
      },
    })
  }

  list(userId: string) {
    return this.prisma.mission.findMany({
      where: { userId, status: { not: 'archived' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { events: { orderBy: { createdAt: 'desc' }, take: 10 } },
    })
  }

  async get(userId: string, id: string) {
    const mission = await this.prisma.mission.findFirst({ where: { id, userId } })
    if (!mission) throw new NotFoundException('Mission not found')
    const [events, tasks] = await Promise.all([
      this.prisma.missionEvent.findMany({ where: { missionId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.agentTask.findMany({ where: { missionId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ])
    return { mission, events, tasks }
  }

  async update(userId: string, id: string, patch: { status?: string; intervalHours?: number; title?: string }) {
    const mission = await this.owned(userId, id)
    const data: Record<string, unknown> = {}
    if (patch.status && ['active', 'paused', 'archived'].includes(patch.status)) data.status = patch.status
    if (patch.intervalHours) data.intervalHours = Math.max(1, Math.min(Number(patch.intervalHours), MAX_INTERVAL_HOURS))
    if (patch.title) data.title = patch.title.trim().slice(0, 120)
    return this.prisma.mission.update({ where: { id: mission.id }, data: data as any })
  }

  /** Kick off a run immediately, bypassing the schedule. */
  async runNow(userId: string, id: string) {
    const mission = await this.owned(userId, id)
    return this.startRun(mission)
  }

  /** Trigger the morning report from stored events without running the agent. */
  async buildReport(userId: string, id: string) {
    const mission = await this.owned(userId, id)
    const since = mission.reportSince ?? mission.lastRunAt ?? mission.createdAt
    const events = await this.prisma.missionEvent.findMany({
      where: { missionId: mission.id, createdAt: { gt: since }, kind: { in: ['run_finished', 'error'] } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    const lines = events.map((e) => `- [${e.createdAt.toISOString().slice(0, 16).replace('T', ' ')}] ${e.message}`)
    const report = lines.length ? lines.join('\n') : 'Nothing happened since the last report.'
    await this.prisma.mission.update({ where: { id: mission.id }, data: { lastReport: report.slice(0, 8000), reportSince: new Date() } })
    await this.prisma.missionEvent.create({ data: { missionId: mission.id, kind: 'report', message: 'Report generated', data: JSON.stringify({ count: events.length }).slice(0, 500) } })
    return { report }
  }

  /** Scheduler heartbeat: start runs for due missions. */
  private async tick() {
    try {
      const due = await this.prisma.mission.findMany({ where: { status: 'active' } })
      for (const mission of due) {
        if (!isMissionDue(mission)) continue
        if (this.driving.has(mission.id)) continue
        // One in-flight run per mission.
        const inFlight = await this.prisma.agentTask.findFirst({
          where: { missionId: mission.id, status: { in: ['planning', 'running', 'awaiting_approval', 'awaiting_input'] } },
          select: { id: true },
        })
        if (inFlight) continue
        await this.startRun(mission)
      }
    } catch (err: any) {
      this.logger.warn(`Mission tick failed: ${err?.message ?? err}`)
    }
  }

  private async startRun(mission: { id: string; userId: string; title: string; goal: string; successCriteria: string; intervalHours: number; runCount: number }) {
    this.driving.add(mission.id)
    try {
      const now = new Date()
      await this.prisma.mission.update({
        where: { id: mission.id },
        data: { lastRunAt: now, nextRunAt: nextRunAfter(now, mission.intervalHours), runCount: { increment: 1 } },
      })
      await this.prisma.missionEvent.create({
        data: { missionId: mission.id, kind: 'run_started', message: `Run #${mission.runCount + 1} started` },
      })
      // Long-lived missions get a generous step budget per run.
      const task = await this.prisma.agentTask.create({
        data: {
          userId: mission.userId,
          missionId: mission.id,
          title: `${mission.title} — run #${mission.runCount + 1}`,
          goal: mission.goal,
          successCriteria: mission.successCriteria,
          status: 'planning',
          maxSteps: 20,
          startedAt: now,
        },
      })
      await this.prisma.agentTaskEvent.create({ data: { taskId: task.id, kind: 'planned', message: 'Mission run created' } })
      void this.tasks.driveMissionRun(task.id)
      return task
    } finally {
      this.driving.delete(mission.id)
    }
  }

  private async owned(userId: string, id: string) {
    const mission = await this.prisma.mission.findFirst({ where: { id, userId } })
    if (!mission) throw new NotFoundException('Mission not found')
    return mission
  }
}
