import { Injectable, Logger } from '@nestjs/common'
import { AgentService } from './agent.service'

export interface ParallelBranch {
  id: string
  task: string
  conversationId: string
  userId: string
}

export interface ParallelResult {
  branchId: string
  task: string
  result: string
  success: boolean
  durationMs: number
}

export interface ParallelRunInput {
  userId: string
  parentConversationId: string
  tasks: string[]   // each task becomes an independent agent branch
  timeout?: number  // ms, default 120_000
}

export interface ParallelRunOutput {
  results: ParallelResult[]
  merged: string
  durationMs: number
  successCount: number
  failCount: number
}

@Injectable()
export class ParallelAgentService {
  private readonly logger = new Logger(ParallelAgentService.name)

  constructor(private readonly agentService: AgentService) {}

  async runParallel(input: ParallelRunInput): Promise<ParallelRunOutput> {
    const start = Date.now()
    const timeout = input.timeout ?? 120_000
    const { userId, tasks } = input

    this.logger.log(`ParallelAgent: launching ${tasks.length} branches for user=${userId}`)

    const branches: Promise<ParallelResult>[] = tasks.map((task, i) => {
      const branchId = `branch_${i}_${Date.now()}`
      return this.runBranch({ branchId, task, userId, timeout })
    })

    const results = await Promise.allSettled(branches)

    const resolved: ParallelResult[] = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            branchId: `branch_${i}`,
            task: tasks[i] ?? '',
            result: r.reason instanceof Error ? r.reason.message : String(r.reason),
            success: false,
            durationMs: 0,
          },
    )

    const successCount = resolved.filter((r) => r.success).length
    const failCount = resolved.length - successCount

    // Merge results into a cohesive summary
    const merged = this.mergeResults(resolved)

    return {
      results: resolved,
      merged,
      durationMs: Date.now() - start,
      successCount,
      failCount,
    }
  }

  private async runBranch(input: {
    branchId: string
    task: string
    userId: string
    timeout: number
  }): Promise<ParallelResult> {
    const start = Date.now()
    let result = ''
    let success = false

    try {
      const chunks: string[] = []
      const emit = (_event: string, data: unknown) => {
        if (typeof data === 'object' && data !== null && 'content' in data) {
          chunks.push(String((data as any).content))
        }
      }

      // Run agent with a timeout race
      const conversationId = `parallel_${input.branchId}_${Date.now()}`

      await Promise.race([
        this.agentService.run({
          conversationId,
          userId: input.userId,
          userMessage: input.task,
          emit,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Branch timed out after ${input.timeout}ms`)), input.timeout),
        ),
      ])

      result = chunks.join('') || 'No output'
      success = true
    } catch (err: any) {
      result = err?.message ?? 'Branch failed'
      success = false
    }

    return {
      branchId: input.branchId,
      task: input.task,
      result,
      success,
      durationMs: Date.now() - start,
    }
  }

  private mergeResults(results: ParallelResult[]): string {
    const successful = results.filter((r) => r.success)
    if (successful.length === 0) return 'All parallel branches failed.'

    const lines = successful.map((r, i) => `**Branch ${i + 1}** (${r.task.slice(0, 60)}):\n${r.result}`)
    return lines.join('\n\n---\n\n')
  }
}
