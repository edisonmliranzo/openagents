import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

@Injectable()
export class ParallelAgentTool implements OnModuleInit {
  private readonly logger = new Logger(ParallelAgentTool.name)
  // Lazily resolved to break the AgentModule <-> ToolsModule circular dep
  private parallelAgentService: any

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    try {
      // Lazy resolution — ParallelAgentService lives in AgentModule which imports ToolsModule
      const { ParallelAgentService } = await import('../../agent/parallel-agent.service')
      this.parallelAgentService = this.moduleRef.get(ParallelAgentService, { strict: false })
    } catch {
      this.logger.warn('ParallelAgentService not available — parallel_agent_run tool will be disabled')
    }
  }

  get def(): ToolDefinition {
    return {
      name: 'parallel_agent_run',
      displayName: 'Parallel Agent Run',
      description:
        'Run multiple agent tasks in parallel and merge the results. Use when a complex request can be decomposed into independent subtasks that benefit from concurrent execution.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of independent tasks to run concurrently. Each task runs as a separate agent branch.',
          },
          timeout_seconds: {
            type: 'number',
            description: 'Max seconds per branch. Defaults to 90.',
          },
        },
        required: ['tasks'],
      },
    }
  }

  async run(
    input: { tasks: string[]; timeout_seconds?: number },
    userId: string,
  ): Promise<ToolResult> {
    if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
      return { success: false, output: null, error: 'tasks must be a non-empty array' }
    }

    if (!this.parallelAgentService) {
      return { success: false, output: null, error: 'ParallelAgentService not available' }
    }

    const max = Math.min(input.tasks.length, 8)
    const tasks = input.tasks.slice(0, max)

    try {
      const output = await this.parallelAgentService.runParallel({
        userId,
        parentConversationId: `tool_parallel_${Date.now()}`,
        tasks,
        timeout: (input.timeout_seconds ?? 90) * 1000,
      })

      return {
        success: true,
        output: {
          merged: output.merged,
          branches: output.results,
          successCount: output.successCount,
          failCount: output.failCount,
          durationMs: output.durationMs,
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err.message }
    }
  }
}
