import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { NanobotBusService } from '../bus/nanobot-bus.service'

interface NanobotSubagentTask {
  id: string
  userId: string
  label: string
  status: 'queued' | 'running' | 'done' | 'error'
  createdAt: string
  updatedAt: string
}

@Injectable()
export class NanobotSubagentService {
  private tasks = new Map<string, NanobotSubagentTask>()

  constructor(private bus: NanobotBusService) {}

  spawn(userId: string, label: string) {
    const now = new Date().toISOString()
    const task: NanobotSubagentTask = {
      id: randomUUID(),
      userId,
      label,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    }
    this.tasks.set(task.id, task)
    this.bus.publish('subagent.spawned', { taskId: task.id, userId, label })

    setTimeout(() => {
      const current = this.tasks.get(task.id)
      if (!current) return
      const updated: NanobotSubagentTask = {
        ...current,
        status: 'done',
        updatedAt: new Date().toISOString(),
      }
      this.tasks.set(task.id, updated)
      this.bus.publish('subagent.completed', { taskId: task.id, userId })
    }, 50)

    return task
  }

  listForUser(userId: string) {
    return [...this.tasks.values()].filter((task) => task.userId === userId)
  }
}

