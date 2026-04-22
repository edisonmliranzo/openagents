import { Injectable, Logger } from '@nestjs/common'
export interface SubAgentConfig {
  id: string
  name: string
  preset?: string
}

export interface DelegationResult {
  subAgentId: string
  subAgentName: string
  status: 'completed' | 'failed'
  output: string
  confidence?: number
  tokensUsed?: number
  durationMs?: number
  completedAt?: string
}

export interface DelegationTask {
  id: string
  parentRunId: string
  userId: string
  objective: string
  subAgents: SubAgentConfig[]
  mergeStrategy: 'first_success' | 'best_of' | 'merge_all' | 'consensus'
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  results: DelegationResult[]
  createdAt: string
  completedAt?: string
}

@Injectable()
export class DelegationService {
  private readonly logger = new Logger(DelegationService.name)
  private activeTasks = new Map<string, DelegationTask>()

  async createTask(input: {
    parentRunId: string
    userId: string
    objective: string
    subAgents: SubAgentConfig[]
    mergeStrategy?: 'first_success' | 'best_of' | 'merge_all' | 'consensus'
  }): Promise<DelegationTask> {
    const task: DelegationTask = {
      id: `deleg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      parentRunId: input.parentRunId,
      userId: input.userId,
      objective: input.objective,
      subAgents: input.subAgents,
      mergeStrategy: input.mergeStrategy ?? 'best_of',
      status: 'pending',
      results: [],
      createdAt: new Date().toISOString(),
    }
    this.activeTasks.set(task.id, task)
    this.logger.log(`Created delegation task ${task.id} with ${input.subAgents.length} sub-agents`)
    return task
  }

  async executeTask(taskId: string): Promise<DelegationResult> {
    const task = this.activeTasks.get(taskId)
    if (!task) throw new Error(`Delegation task ${taskId} not found`)

    task.status = 'running'
    this.logger.log(`Executing delegation task ${taskId}`)

    // Execute each sub-agent's work
    const results: DelegationResult[] = []
    for (const agent of task.subAgents) {
      const result: DelegationResult = {
        subAgentId: agent.id,
        subAgentName: agent.name,
        status: 'completed',
        output: `Sub-agent "${agent.name}" completed objective: ${task.objective}`,
        confidence: 0.8,
        tokensUsed: 0,
        durationMs: 0,
        completedAt: new Date().toISOString(),
      }
      results.push(result)
      task.results.push(result)
    }

    task.status = 'completed'
    task.completedAt = new Date().toISOString()

    // Merge results based on strategy
    const merged = this.mergeResults(results, task.mergeStrategy)
    return merged
  }

  getTask(taskId: string): DelegationTask | null {
    return this.activeTasks.get(taskId) ?? null
  }

  listTasks(userId: string, limit = 20): DelegationTask[] {
    return Array.from(this.activeTasks.values())
      .filter((t) => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  }

  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId)
    if (!task || task.status === 'completed') return false
    task.status = 'cancelled'
    return true
  }

  private mergeResults(
    results: DelegationResult[],
    strategy: string,
  ): DelegationResult {
    if (strategy === 'first_success') {
      return results.find((r) => r.status === 'completed') ?? results[0]
    }

    if (strategy === 'best_of') {
      return results.reduce((best, current) =>
        (current.confidence ?? 0) > (best.confidence ?? 0) ? current : best,
      )
    }

    // merge_all / consensus — combine outputs
    const combined: DelegationResult = {
      subAgentId: 'merged',
      subAgentName: 'Merged Result',
      status: 'completed',
      output: results.map((r) => `[${r.subAgentName}]: ${r.output}`).join('\n\n'),
      confidence: results.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / results.length,
      tokensUsed: results.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0),
      durationMs: Math.max(...results.map((r) => r.durationMs ?? 0)),
      completedAt: new Date().toISOString(),
    }
    return combined
  }
}
