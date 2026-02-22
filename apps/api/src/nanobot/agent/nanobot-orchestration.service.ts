import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type {
  NanobotOrchestrationRun,
  NanobotOrchestrationTask,
  NanobotRoleDecision,
} from '../types'

@Injectable()
export class NanobotOrchestrationService {
  private readonly runs = new Map<string, NanobotOrchestrationRun>()
  private readonly maxRuns = 400

  startRun(input: {
    runId: string
    userId: string
    conversationId: string
    decision: NanobotRoleDecision
  }): NanobotOrchestrationRun {
    const now = new Date().toISOString()
    const tasks: NanobotOrchestrationTask[] = [
      this.createTask('planner', `Plan objective: ${input.decision.plannerGoal}`),
      this.createTask('executor', `Execute intent: ${input.decision.executorIntent}`),
      this.createTask(
        'reviewer',
        input.decision.criticConcerns.length > 0
          ? `Review concerns: ${input.decision.criticConcerns.join(' | ')}`
          : 'Review output quality and safety',
      ),
    ]

    const run: NanobotOrchestrationRun = {
      runId: input.runId,
      userId: input.userId,
      conversationId: input.conversationId,
      objective: input.decision.plannerGoal,
      stage: 'planning',
      sharedState: {
        plan: [...input.decision.plannerPlan],
        concerns: [...input.decision.criticConcerns],
        toolLog: [],
        summary: null,
      },
      tasks,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }

    this.runs.set(run.runId, run)
    this.prune()
    return run
  }

  markPlanningComplete(runId: string, note = 'Planner completed initial decomposition') {
    this.updateRun(runId, (run) => {
      run.stage = 'executing'
      this.updateTask(run, 'planner', 'done', note)
      this.updateTask(run, 'executor', 'running', 'Executor started')
    })
  }

  addToolEvent(runId: string, toolName: string, status: 'ok' | 'error') {
    this.updateRun(runId, (run) => {
      run.stage = 'executing'
      run.sharedState.toolLog.push(`${new Date().toISOString()} ${toolName} (${status})`)
      if (run.sharedState.toolLog.length > 30) {
        run.sharedState.toolLog = run.sharedState.toolLog.slice(-30)
      }
      this.updateTask(
        run,
        'executor',
        status === 'error' ? 'error' : 'running',
        `Tool ${toolName} ${status === 'ok' ? 'executed' : 'failed'}`,
      )
    })
  }

  markReviewing(runId: string, note = 'Reviewer validating result and safety') {
    this.updateRun(runId, (run) => {
      run.stage = 'reviewing'
      if (this.taskStatus(run, 'executor') !== 'error') {
        this.updateTask(run, 'executor', 'done', 'Executor finished actions')
      }
      this.updateTask(run, 'reviewer', 'running', note)
    })
  }

  completeRun(runId: string, summary: string | null) {
    this.updateRun(runId, (run) => {
      run.stage = 'done'
      run.sharedState.summary = summary
      this.updateTask(run, 'planner', 'done', 'Planner complete')
      if (this.taskStatus(run, 'executor') !== 'error') {
        this.updateTask(run, 'executor', 'done', 'Executor complete')
      }
      this.updateTask(run, 'reviewer', 'done', 'Reviewer complete')
      run.completedAt = new Date().toISOString()
    })
  }

  failRun(runId: string, reason: string) {
    this.updateRun(runId, (run) => {
      run.stage = 'error'
      run.sharedState.summary = reason
      this.updateTask(run, 'reviewer', 'error', reason)
      run.completedAt = new Date().toISOString()
    })
  }

  listForUser(userId: string, limit = 20) {
    return [...this.runs.values()]
      .filter((run) => run.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)))
  }

  getForUser(userId: string, runId: string) {
    const run = this.runs.get(runId)
    if (!run || run.userId !== userId) {
      throw new NotFoundException(`Orchestration run "${runId}" not found.`)
    }
    return run
  }

  private updateRun(runId: string, mutate: (run: NanobotOrchestrationRun) => void) {
    const run = this.runs.get(runId)
    if (!run) return
    mutate(run)
    run.updatedAt = new Date().toISOString()
    this.runs.set(runId, run)
  }

  private updateTask(
    run: NanobotOrchestrationRun,
    role: NanobotOrchestrationTask['role'],
    status: NanobotOrchestrationTask['status'],
    note: string,
  ) {
    const task = run.tasks.find((item) => item.role === role)
    if (!task) return
    task.status = status
    if (note.trim()) {
      task.notes.push(note.trim())
      if (task.notes.length > 12) {
        task.notes = task.notes.slice(-12)
      }
    }
    task.updatedAt = new Date().toISOString()
  }

  private taskStatus(run: NanobotOrchestrationRun, role: NanobotOrchestrationTask['role']) {
    return run.tasks.find((task) => task.role === role)?.status
  }

  private createTask(role: NanobotOrchestrationTask['role'], label: string): NanobotOrchestrationTask {
    return {
      id: randomUUID(),
      role,
      label: label.slice(0, 200),
      status: role === 'planner' ? 'running' : 'queued',
      notes: [],
      updatedAt: new Date().toISOString(),
    }
  }

  private prune() {
    if (this.runs.size <= this.maxRuns) return
    const sorted = [...this.runs.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    const overflow = sorted.length - this.maxRuns
    for (let idx = 0; idx < overflow; idx += 1) {
      this.runs.delete(sorted[idx].runId)
    }
  }
}
