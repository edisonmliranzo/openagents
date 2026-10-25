import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from './llm.service'
import { ToolsService } from '../tools/tools.service'
import { UsersService } from '../users/users.service'
import { PushService } from '../notifications/push.service'
import { ToolPermissionsService } from '../permissions/tool-permissions.service'

const MAX_RESUME_ROUNDS = 8
const CHECKPOINT_MAX_BYTES = 400_000
const STALE_AFTER_MS = 3 * 60 * 1000
const LLM_CALL_TIMEOUT_MS = 150_000

export interface RunCheckpoint {
  version: 1
  workingMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  systemPrompt: string
  toolRound: number
  maxToolRounds: number
  mode?: string
  provider?: string
  model?: string | null
  userMessage: string
}

/**
 * Durable execution for the main agent loop (LangGraph-style): every tool
 * round checkpoints the working state onto the run record; on boot,
 * interrupted runs with a checkpoint are RESUMED headlessly instead of being
 * discarded, and the finished answer is posted to the conversation with a
 * push notification.
 */
@Injectable()
export class DurableExecutionService {
  private readonly logger = new Logger(DurableExecutionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly tools: ToolsService,
    private readonly users: UsersService,
    private readonly push: PushService,
    private readonly toolPermissions: ToolPermissionsService,
  ) {}

  /** Persist the loop state after each completed tool round. */
  async saveCheckpoint(runId: string, state: RunCheckpoint): Promise<void> {
    try {
      const json = JSON.stringify(state)
      if (json.length > CHECKPOINT_MAX_BYTES) {
        // Keep the tail of the working state; huge context cannot be resumed faithfully.
        const trimmed = state.workingMessages.slice(-12)
        const compact = { ...state, workingMessages: trimmed }
        const compactJson = JSON.stringify(compact)
        await this.prisma.agentRun.update({ where: { id: runId }, data: { checkpointJson: compactJson } })
        return
      }
      await this.prisma.agentRun.update({ where: { id: runId }, data: { checkpointJson: json } })
    } catch (err: any) {
      this.logger.warn(`Checkpoint save failed for run ${runId}: ${err?.message ?? err}`)
    }
  }

  async clearCheckpoint(runId: string): Promise<void> {
    try {
      await this.prisma.agentRun.update({ where: { id: runId }, data: { checkpointJson: null } })
    } catch {
      // Best-effort: a completed run's checkpoint is harmless residue.
    }
  }

  /**
   * Boot-time sweep. Runs mid-flight when the process died:
   * - with a checkpoint -> resume headlessly and finish the work
   * - without one -> the old behavior (mark interrupted, discard)
   */
  async resumeInterruptedRuns(): Promise<void> {
    try {
      const staleBefore = new Date(Date.now() - STALE_AFTER_MS)
      const stale = await this.prisma.agentRun.findMany({
        where: { status: { in: ['thinking', 'running_tool'] }, startedAt: { lt: staleBefore } },
        orderBy: { startedAt: 'asc' },
        take: 10,
      })
      for (const run of stale) {
        if (run.checkpointJson && run.userId) {
          await this.prisma.agentRun.update({
            where: { id: run.id },
            data: { status: 'thinking', error: null },
          })
          void this.continueRun(run.id).catch((err) =>
            this.logger.error(`Resume of run ${run.id} failed: ${err?.message ?? err}`),
          )
        } else {
          await this.prisma.agentRun.updateMany({
            where: { id: run.id },
            data: { status: 'error', finishedAt: new Date(), error: 'interrupted by server restart (no checkpoint)' },
          })
          this.logger.warn(`Marked run ${run.id} interrupted (no checkpoint to resume).`)
        }
      }
      if (stale.length > 0) {
        this.logger.log(`Durable execution: ${stale.length} interrupted run(s) handled at boot.`)
      }
    } catch (error: any) {
      this.logger.warn(`Interrupted-run sweep failed: ${error?.message ?? error}`)
    }
  }

  /** Hard timeout so a wedged provider/tool can never stall a resume forever. */
  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms).unref(),
      ),
    ])
  }

  /** Headless continuation: finish the interrupted run, post the answer, notify. */
  async continueRun(runId: string): Promise<void> {
    const run = await this.prisma.agentRun.findUnique({ where: { id: runId } })
    if (!run?.checkpointJson || !run.userId) return
    let checkpoint: RunCheckpoint
    try {
      checkpoint = JSON.parse(run.checkpointJson) as RunCheckpoint
    } catch {
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'error', finishedAt: new Date(), error: 'resume failed: unreadable checkpoint', checkpointJson: null },
      })
      return
    }

    const userId = run.userId
    const provider = (checkpoint.provider ?? undefined) as any
    const userKey = await this.users.getRawLlmKey(userId, provider).catch(() => null)
    const apiKey = userKey?.isActive ? (userKey.apiKey ?? userKey.loginPassword ?? undefined) : undefined
    const baseUrl = userKey?.isActive ? (userKey.baseUrl ?? undefined) : undefined

    let availableTools: any[] = []
    try {
      availableTools = await this.tools.getAvailableForUser(userId)
    } catch (err: any) {
      this.logger.warn(`Resume ${runId}: tool list unavailable (${err?.message ?? err})`)
    }

    const workingMessages = [...checkpoint.workingMessages]
    const systemPrompt =
      `${checkpoint.systemPrompt}\n\n## Interrupted run resume\n` +
      `You were interrupted mid-task by a restart and are now resuming headlessly. ` +
      `Complete the original request from the state above, use tools if still needed, then give the final answer.`
    const roundCap = Math.min(checkpoint.maxToolRounds, checkpoint.toolRound + MAX_RESUME_ROUNDS)
    let toolRound = checkpoint.toolRound
    let finalAnswer = ''

    try {
      this.logger.log(`Resume ${runId}: starting (provider=${String(provider)}, model=${String(checkpoint.model)}, tools=${availableTools.length}, round=${toolRound})`)
      while (toolRound < roundCap) {
        const response = await this.withTimeout(
          this.llm.complete(workingMessages, availableTools, systemPrompt, provider, apiKey, baseUrl, checkpoint.model ?? undefined),
          LLM_CALL_TIMEOUT_MS,
          `LLM round ${toolRound + 1}`,
        )
        const content = (response.content ?? '').trim()
        this.logger.log(`Resume ${runId}: round ${toolRound + 1} stopReason=${response.stopReason}, tools=${response.toolCalls?.length ?? 0}, content=${content.length} chars`)
        if (content && response.stopReason !== 'tool_use') {
          finalAnswer = content
          break
        }
        if (!response.toolCalls?.length) {
          finalAnswer = content || 'I could not complete the interrupted task automatically.'
          break
        }
        workingMessages.push({ role: 'assistant', content })
        for (const toolCall of response.toolCalls) {
          try {
            const permission = await this.toolPermissions.resolutionFor(userId, toolCall.name)
            if (permission.effect === 'deny') {
              workingMessages.push({
                role: 'assistant',
                content: `Tool "${toolCall.name}" is blocked by the user's permission rules (${permission.reason}). Use an alternative.`,
              })
              continue
            }
          } catch {
            // rules unreadable -> proceed with default behavior
          }
          this.logger.log(`Resume ${runId}: executing ${toolCall.name}`)
          const result = await this.withTimeout(
            this.tools.execute(toolCall.name, toolCall.input ?? {}, userId),
            LLM_CALL_TIMEOUT_MS,
            `tool ${toolCall.name}`,
          )
          const preview = JSON.stringify(result.output ?? null).slice(0, 12_000)
          workingMessages.push({
            role: 'assistant',
            content: result.success
              ? `Tool result for ${toolCall.name}:\n${preview}`
              : `Tool ${toolCall.name} failed: ${result.error ?? 'unknown error'}. Adjust or try an alternative.`,
          })
        }
        toolRound += 1
        await this.saveCheckpoint(runId, { ...checkpoint, workingMessages, toolRound })
      }

      if (!finalAnswer) {
        try {
          const synthesis = await this.withTimeout(
            this.llm.complete(
              [...workingMessages, { role: 'user', content: 'Based on the work above, provide the final complete answer to the original request.' }],
              [],
              systemPrompt,
              provider,
              apiKey,
              baseUrl,
              checkpoint.model ?? undefined,
            ),
            LLM_CALL_TIMEOUT_MS,
            'final synthesis',
          )
          finalAnswer = (synthesis.content ?? '').trim() || 'The interrupted task was resumed but could not produce a final answer.'
        } catch {
          finalAnswer = 'The interrupted task was resumed but could not produce a final answer.'
        }
      }

      await this.prisma.message.create({
        data: {
          conversationId: run.conversationId,
          role: 'agent',
          content: finalAnswer,
          status: 'done',
          metadata: JSON.stringify({ resumedFromRunId: run.id }),
        },
      })
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'done', finishedAt: new Date(), error: null, checkpointJson: null },
      })
      const notified = await this.push.sendToUser(userId, {
        title: 'Interrupted task finished',
        body: `I resumed the task interrupted by the restart and completed it: "${checkpoint.userMessage.slice(0, 120)}"`,
        url: `/chat?conversation=${run.conversationId}`,
      }).catch(() => ({ sent: 0 }))
      this.logger.log(`Resumed run ${run.id} to completion (push sent: ${notified?.sent ?? 0}).`)
    } catch (err: any) {
      this.logger.error(`Resume of run ${runId} failed: ${err?.message ?? err}`)
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'error', finishedAt: new Date(), error: `resume failed: ${err?.message ?? err}`, checkpointJson: null },
      })
    }
  }
}
