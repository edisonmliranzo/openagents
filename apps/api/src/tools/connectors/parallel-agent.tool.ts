import { Injectable, Logger } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import { ParallelAgentService } from '../../agent/parallel-agent.service'

@Injectable()
export class ParallelAgentTool {
  private readonly logger = new Logger(ParallelAgentTool.name)

  constructor(private readonly parallelAgent: ParallelAgentService) {}

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

    const max = Math.min(input.tasks.length, 8) // cap at 8 parallel branches
    const tasks = input.tasks.slice(0, max)

    try {
      const output = await this.parallelAgent.runParallel({
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
