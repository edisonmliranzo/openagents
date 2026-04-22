import { Injectable, Logger } from '@nestjs/common'

export interface ScheduledTask {
  id: string
  userId: string
  name: string
  description: string
  schedule: string // cron expression or 'once'
  nextRunAt: string
  lastRunAt?: string
  lastRunStatus?: 'success' | 'failed'
  action: {
    type: 'send_message' | 'run_tool' | 'run_workflow'
    conversationId?: string
    message?: string
    toolName?: string
    toolInput?: Record<string, unknown>
    workflowId?: string
  }
  enabled: boolean
  runCount: number
  maxRuns?: number
  createdAt: string
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name)
  private tasks = new Map<string, ScheduledTask>()
  private timers = new Map<string, NodeJS.Timeout>()

  async create(input: {
    userId: string
    name: string
    description?: string
    schedule: string
    action: ScheduledTask['action']
    maxRuns?: number
  }): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      name: input.name,
      description: input.description ?? '',
      schedule: input.schedule,
      nextRunAt: this.calculateNextRun(input.schedule),
      action: input.action,
      enabled: true,
      runCount: 0,
      maxRuns: input.maxRuns,
      createdAt: new Date().toISOString(),
    }
    this.tasks.set(task.id, task)
    this.scheduleExecution(task)
    this.logger.log(`Created scheduled task "${task.name}" (${task.schedule})`)
    return task
  }

  async enable(taskId: string): Promise<ScheduledTask | null> {
    const task = this.tasks.get(taskId)
    if (!task) return null
    task.enabled = true
    task.nextRunAt = this.calculateNextRun(task.schedule)
    this.scheduleExecution(task)
    return task
  }

  async disable(taskId: string): Promise<ScheduledTask | null> {
    const task = this.tasks.get(taskId)
    if (!task) return null
    task.enabled = false
    this.cancelTimer(taskId)
    return task
  }

  async delete(taskId: string): Promise<boolean> {
    this.cancelTimer(taskId)
    return this.tasks.delete(taskId)
  }

  async list(userId: string): Promise<ScheduledTask[]> {
    return Array.from(this.tasks.values())
      .filter((t) => t.userId === userId)
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
  }

  async get(taskId: string): Promise<ScheduledTask | null> {
    return this.tasks.get(taskId) ?? null
  }

  private scheduleExecution(task: ScheduledTask): void {
    this.cancelTimer(task.id)
    if (!task.enabled) return

    const delay = Math.max(0, new Date(task.nextRunAt).getTime() - Date.now())
    const timer = setTimeout(async () => {
      await this.executeTask(task.id)
    }, Math.min(delay, 2_147_483_647)) // Max setTimeout value

    this.timers.set(task.id, timer)
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || !task.enabled) return

    this.logger.log(`Executing scheduled task "${task.name}"`)
    task.runCount += 1
    task.lastRunAt = new Date().toISOString()
    task.lastRunStatus = 'success'

    // Check max runs
    if (task.maxRuns && task.runCount >= task.maxRuns) {
      task.enabled = false
      return
    }

    // Schedule next run
    if (task.schedule !== 'once') {
      task.nextRunAt = this.calculateNextRun(task.schedule)
      this.scheduleExecution(task)
    } else {
      task.enabled = false
    }
  }

  private cancelTimer(taskId: string): void {
    const timer = this.timers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(taskId)
    }
  }

  private calculateNextRun(schedule: string): string {
    if (schedule === 'once') {
      return new Date(Date.now() + 60_000).toISOString()
    }

    // Parse simple interval patterns: "every 5m", "every 1h", "every 1d"
    const intervalMatch = schedule.match(/^every\s+(\d+)\s*(m|min|h|hr|hour|d|day)s?$/i)
    if (intervalMatch) {
      const amount = parseInt(intervalMatch[1], 10)
      const unit = intervalMatch[2].toLowerCase()
      let ms = amount * 60_000 // default minutes
      if (unit.startsWith('h')) ms = amount * 3_600_000
      if (unit.startsWith('d')) ms = amount * 86_400_000
      return new Date(Date.now() + ms).toISOString()
    }

    // Default: 1 hour from now
    return new Date(Date.now() + 3_600_000).toISOString()
  }
}
