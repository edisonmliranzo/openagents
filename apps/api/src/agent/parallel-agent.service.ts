import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AgentService } from './agent.service'
import { LLMService } from './llm.service'
import { UsersService } from '../users/users.service'
import type { LLMProvider } from '@openagents/shared'

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

  constructor(
    private readonly agentService: AgentService,
    private readonly llm: LLMService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

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
    const merged = await this.mergeResults(resolved, userId)

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

  private async mergeResults(results: ParallelResult[], userId: string): Promise<string> {
    const successful = results.filter((r) => r.success)
    if (successful.length === 0) return 'All parallel branches failed.'

    const lines = successful.map((r, i) => `**Branch ${i + 1}** (${r.task.slice(0, 60)}):\n${r.result}`)
    const concat = lines.join('\n\n---\n\n')

    const raw = (this.config.get<string>('MERGE_CRITIC') ?? 'false').trim().toLowerCase()
    const mergeCritic = ['1', 'true', 'yes', 'on'].includes(raw)
    if (!mergeCritic || successful.length < 2) return concat

    try {
      const settings = await this.users.getSettings(userId)
      const provider = (settings.preferredProvider ?? 'ollama') as LLMProvider
      const key = await this.users.getRawLlmKey(userId, provider).catch(() => null)
      const apiKey = key?.isActive ? (key.apiKey ?? key.loginPassword ?? undefined) : undefined
      const baseUrl = key?.isActive ? (key.baseUrl ?? undefined) : undefined
      const synthesis = await this.llm.complete(
        [
          {
            role: 'user',
            content: `Multiple specialist agents worked on parts of one goal. Synthesize their outputs into ONE coherent final answer. Resolve conflicts, drop duplication, keep every concrete fact.\n\n${concat.slice(0, 12000)}`,
          },
        ],
        [],
        'You are a synthesis critic for an agent swarm. Produce the single best merged answer.',
        provider,
        apiKey,
        baseUrl,
        settings.preferredModel ?? undefined,
      )
      const text = (synthesis.content ?? '').trim()
      return text || concat
    } catch (error: any) {
      this.logger.debug(`Merge critic skipped: ${error?.message ?? error}`)
      return concat
    }
  }
}
