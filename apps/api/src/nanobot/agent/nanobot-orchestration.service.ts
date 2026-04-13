import { Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type {
  NanobotAddSubtaskInput,
  NanobotOrchestrationRun,
  NanobotOrchestrationTask,
  NanobotOrchestrationTaskRole,
  NanobotRoleDecision,
} from '../types'

const MAX_TASK_RETRIES = 2

@Injectable()
export class NanobotOrchestrationService {
  private readonly runs = new Map<string, NanobotOrchestrationRun>()
  private readonly maxRuns = 400

  // ── Run lifecycle ───────────────────────────────────────────────────────────

  startRun(input: {
    runId: string
    userId: string
    conversationId: string
    decision: NanobotRoleDecision
  }): NanobotOrchestrationRun {
    const now = new Date().toISOString()

    const planner = this.createTask('planner', `Plan objective: ${input.decision.plannerGoal}`)
    const executor = this.createTask('executor', `Execute intent: ${input.decision.executorIntent}`, [planner.id])
    const reviewer = this.createTask(
      'reviewer',
      input.decision.criticConcerns.length > 0
        ? `Review concerns: ${input.decision.criticConcerns.join(' | ')}`
        : 'Review output quality and safety',
      [executor.id],
    )

    // Executor waits for planner; reviewer waits for executor
    executor.status = 'waiting'
    reviewer.status = 'waiting'

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
      tasks: [planner, executor, reviewer],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }

    this.runs.set(run.runId, run)
    this.prune()
    return run
  }

  markPlanningComplete(runId: string, output = 'Planner completed initial decomposition') {
    this.updateRun(runId, (run) => {
      run.stage = 'executing'
      this.setTaskOutput(run, 'planner', output)
      this.updateTask(run, 'planner', 'done', output)
      this.scheduleReady(run)
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
      const executor = run.tasks.find((t) => t.role === 'executor')
      if (executor && executor.status !== 'error') {
        this.updateTask(run, 'executor', 'done', 'Executor finished actions')
      }
      this.scheduleReady(run)
      this.updateTask(run, 'reviewer', 'running', note)
    })
  }

  completeRun(runId: string, summary: string | null) {
    this.updateRun(runId, (run) => {
      run.stage = 'done'
      run.sharedState.summary = summary
      this.updateTask(run, 'planner', 'done', 'Planner complete')
      const executor = run.tasks.find((t) => t.role === 'executor')
      if (executor && executor.status !== 'error') {
        this.updateTask(run, 'executor', 'done', 'Executor complete')
      }
      this.updateTask(run, 'reviewer', 'done', 'Reviewer complete')
      // Mark remaining waiting subtasks as skipped
      for (const task of run.tasks) {
        if (task.status === 'waiting' || task.status === 'queued') {
          task.status = 'skipped'
          task.updatedAt = new Date().toISOString()
        }
      }
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

  // ── Subtask management ──────────────────────────────────────────────────────

  /**
   * Dynamically add a subtask to a running orchestration with optional dependency IDs.
   * If all dependencies are already done, the task starts immediately (status = 'running').
   * Otherwise it waits (status = 'waiting').
   */
  addSubtask(runId: string, userId: string, input: NanobotAddSubtaskInput): NanobotOrchestrationTask {
    const run = this.runs.get(runId)
    if (!run || run.userId !== userId) {
      throw new NotFoundException(`Orchestration run "${runId}" not found.`)
    }

    const dependsOn = input.dependsOn ?? []
    const allDepsDone = dependsOn.every((depId) => {
      const dep = run.tasks.find((t) => t.id === depId)
      return dep?.status === 'done'
    })

    const task = this.createTask('subtask', input.label, dependsOn)
    task.status = allDepsDone ? 'running' : 'waiting'

    run.tasks.push(task)
    run.updatedAt = new Date().toISOString()
    this.runs.set(runId, run)
    return task
  }

  /**
   * Mark a subtask complete with output. Unblocks any tasks waiting on it.
   */
  completeSubtask(runId: string, taskId: string, output: string | null, note = '') {
    this.updateRun(runId, (run) => {
      const task = run.tasks.find((t) => t.id === taskId)
      if (!task) return
      task.status = 'done'
      task.output = output
      if (note) {
        task.notes.push(note)
        if (task.notes.length > 12) task.notes = task.notes.slice(-12)
      }
      task.updatedAt = new Date().toISOString()
      this.scheduleReady(run)
    })
  }

  /**
   * Mark a subtask failed. Retries up to MAX_TASK_RETRIES before final error.
   * Returns true if retrying, false if permanently failed.
   */
  failSubtask(runId: string, taskId: string, reason: string): boolean {
    let willRetry = false
    this.updateRun(runId, (run) => {
      const task = run.tasks.find((t) => t.id === taskId)
      if (!task) return
      if (task.retries < MAX_TASK_RETRIES) {
        task.retries += 1
        task.status = 'running'
        task.notes.push(`Retry ${task.retries}/${MAX_TASK_RETRIES}: ${reason}`)
        willRetry = true
      } else {
        task.status = 'error'
        task.notes.push(`Failed after ${task.retries} retries: ${reason}`)
        // Skip all tasks that depend (directly or transitively) on this failed task
        this.cascadeSkip(run, taskId)
      }
      task.updatedAt = new Date().toISOString()
    })
    return willRetry
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

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

  /**
   * Return tasks that are ready to run (all dependencies done) but not yet started.
   */
  getReadyTasks(runId: string): NanobotOrchestrationTask[] {
    const run = this.runs.get(runId)
    if (!run) return []
    return run.tasks.filter((task) => this.isReady(run, task) && task.status === 'waiting')
  }

  /**
   * Build the dependency context string from all completed dependency outputs.
   * Useful for injecting upstream results into an LLM prompt.
   */
  buildDependencyContext(runId: string, taskId: string): string {
    const run = this.runs.get(runId)
    if (!run) return ''
    const task = run.tasks.find((t) => t.id === taskId)
    if (!task || task.dependsOn.length === 0) return ''

    const parts: string[] = []
    for (const depId of task.dependsOn) {
      const dep = run.tasks.find((t) => t.id === depId)
      if (dep?.output) {
        parts.push(`[${dep.label.slice(0, 60)}]\n${dep.output.slice(0, 2000)}`)
      }
    }
    return parts.join('\n\n')
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * After a task completes, promote any waiting tasks whose dependencies are all done.
   */
  private scheduleReady(run: NanobotOrchestrationRun) {
    for (const task of run.tasks) {
      if (task.status === 'waiting' && this.isReady(run, task)) {
        task.status = 'running'
        task.notes.push('Dependencies satisfied — starting.')
        task.updatedAt = new Date().toISOString()
      }
    }
  }

  private isReady(run: NanobotOrchestrationRun, task: NanobotOrchestrationTask): boolean {
    if (task.dependsOn.length === 0) return true
    return task.dependsOn.every((depId) => {
      const dep = run.tasks.find((t) => t.id === depId)
      return dep?.status === 'done'
    })
  }

  /** Recursively mark all tasks that (transitively) depend on failedId as skipped. */
  private cascadeSkip(run: NanobotOrchestrationRun, failedId: string) {
    const toSkip = new Set<string>()
    const queue = [failedId]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const task of run.tasks) {
        if (task.dependsOn.includes(current) && !toSkip.has(task.id) && task.status !== 'done') {
          toSkip.add(task.id)
          queue.push(task.id)
        }
      }
    }
    for (const taskId of toSkip) {
      const task = run.tasks.find((t) => t.id === taskId)
      if (task && task.status !== 'done' && task.status !== 'error') {
        task.status = 'skipped'
        task.notes.push(`Skipped: dependency ${failedId} failed.`)
        task.updatedAt = new Date().toISOString()
      }
    }
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
    role: NanobotOrchestrationTaskRole,
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

  private setTaskOutput(run: NanobotOrchestrationRun, role: NanobotOrchestrationTaskRole, output: string) {
    const task = run.tasks.find((t) => t.role === role)
    if (task) task.output = output.slice(0, 4000)
  }

  private createTask(
    role: NanobotOrchestrationTaskRole,
    label: string,
    dependsOn: string[] = [],
  ): NanobotOrchestrationTask {
    return {
      id: randomUUID(),
      role,
      label: label.slice(0, 200),
      status: role === 'planner' ? 'running' : 'queued',
      notes: [],
      dependsOn,
      output: null,
      retries: 0,
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
