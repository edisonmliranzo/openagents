import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { NanobotBusService } from '../bus/nanobot-bus.service'
import type { NanobotRoleDecision, NanobotSubagentRole, NanobotSubagentTask } from '../types'

@Injectable()
export class NanobotSubagentService {
  private tasks = new Map<string, NanobotSubagentTask>()
  private readonly maxTasks = 500

  constructor(private bus: NanobotBusService) {}

  spawn(userId: string, label: string, role: NanobotSubagentRole = 'telemetry', runId?: string) {
    const now = new Date().toISOString()
    const task: NanobotSubagentTask = {
      id: randomUUID(),
      userId,
      role,
      label,
      status: 'running',
      ...(runId ? { runId } : {}),
      createdAt: now,
      updatedAt: now,
    }
    this.tasks.set(task.id, task)
    this.pruneOldTasks()
    this.bus.publish('subagent.spawned', { taskId: task.id, userId, label, role, runId })

    setTimeout(() => {
      this.completeTask(task.id, userId, role, runId)
    }, 50)

    return task
  }

  spawnRoleCrew(userId: string, runId: string, decision: NanobotRoleDecision) {
    const planner = this.spawn(
      userId,
      `Plan goal: ${decision.plannerGoal}`.slice(0, 140),
      'planner',
      runId,
    )
    const executor = this.spawn(
      userId,
      `Execute intent: ${decision.executorIntent}`.slice(0, 140),
      'executor',
      runId,
    )
    const critic = this.spawn(
      userId,
      `Critique risk: ${
        decision.criticConcerns.length > 0
          ? decision.criticConcerns.join(' | ')
          : 'No major blockers'
      }`.slice(0, 180),
      'critic',
      runId,
    )
    return [planner, executor, critic]
  }

  listForUser(userId: string) {
    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 50)
  }

  private completeTask(taskId: string, userId: string, role: NanobotSubagentRole, runId?: string) {
    const current = this.tasks.get(taskId)
    if (!current) return
    const updated: NanobotSubagentTask = {
      ...current,
      status: 'done',
      updatedAt: new Date().toISOString(),
    }
    this.tasks.set(taskId, updated)
    this.bus.publish('subagent.completed', { taskId, userId, role, runId })
  }

  private pruneOldTasks() {
    if (this.tasks.size <= this.maxTasks) return
    const sorted = [...this.tasks.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    const overflow = sorted.length - this.maxTasks
    for (let index = 0; index < overflow; index += 1) {
      this.tasks.delete(sorted[index].id)
    }
  }
}
