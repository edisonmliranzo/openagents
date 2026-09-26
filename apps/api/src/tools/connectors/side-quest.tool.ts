import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

/**
 * Fire-and-forget background task: the agent spawns a side quest that runs
 * in its own conversation and reports back via notification + in-app message.
 */
@Injectable()
export class SideQuestTool implements OnModuleInit {
  private readonly logger = new Logger(SideQuestTool.name)
  private agentService: any
  private prisma: any

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    try {
      const { AgentService } = await import('../../agent/agent.service')
      this.agentService = this.moduleRef.get(AgentService, { strict: false })
      const { PrismaService } = await import('../../prisma/prisma.service')
      this.prisma = this.moduleRef.get(PrismaService, { strict: false })
    } catch {
      this.logger.warn('SideQuestTool dependencies unavailable — side_quest tool disabled')
    }
  }

  get def(): ToolDefinition {
    return {
      name: 'side_quest',
      displayName: 'Side Quest',
      description:
        'Start a background task the user asked for "while you\'re at it" or "also do X". Runs independently and reports when done. Use when the user queues extra work you should not block the current answer for.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short label for the quest (e.g. "Research CRM options")' },
          task: { type: 'string', description: 'Full instruction for the background agent' },
        },
        required: ['title', 'task'],
      },
    }
  }

  async run(input: { title: string; task: string }, userId: string): Promise<ToolResult> {
    if (!this.agentService || !this.prisma) {
      return { success: false, output: null, error: 'Side quests are unavailable on this server.' }
    }
    const title = String(input.title ?? '').trim().slice(0, 80)
    const task = String(input.task ?? '').trim()
    if (!title || !task) {
      return { success: false, output: null, error: 'Both title and task are required.' }
    }

    const conversation = await this.prisma.conversation.create({
      data: { userId, title: `Side quest: ${title}` },
      select: { id: true },
    })

    // Fire and forget — the quest reports back when it finishes.
    void (async () => {
      let reply = ''
      try {
        await this.agentService.run({
          conversationId: conversation.id,
          userId,
          userMessage: task,
          emit: (event: string, data: unknown) => {
            if (event === 'message') {
              const row = data as { role?: string; content?: string }
              if (row?.role === 'agent' && row.content) reply = row.content
            }
          },
          systemPromptAppendix: 'This is a background side quest started from another conversation. Be thorough but self-contained; your final answer will be delivered back to the user.',
        })
        await this.prisma.notification.create({
          data: {
            userId,
            title: `Side quest done: ${title}`,
            message: (reply || 'Completed — open the side quest conversation to see the result.').slice(0, 300),
            type: 'success',
          },
        })
      } catch (error: any) {
        await this.prisma.notification
          .create({
            data: {
              userId,
              title: `Side quest failed: ${title}`,
              message: String(error?.message ?? error).slice(0, 300),
              type: 'error',
            },
          })
          .catch(() => undefined)
      }
    })()

    return {
      success: true,
      output: {
        status: 'started',
        conversationId: conversation.id,
        note: `Side quest "${title}" is running in the background. You will be notified when it finishes.`,
      },
    }
  }
}
