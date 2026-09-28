import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'

/**
 * Hand a task to a named specialist agent (own persona + monthly budget).
 * Runs in the specialist's own conversation and reports spend back.
 */
@Injectable()
export class DelegateSpecialistTool implements OnModuleInit {
  private readonly logger = new Logger(DelegateSpecialistTool.name)
  private agentService: any
  private specialistsService: any
  private prisma: any

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    try {
      const { AgentService } = await import('../../agent/agent.service')
      this.agentService = this.moduleRef.get(AgentService, { strict: false })
      const { SpecialistsService } = await import('../../specialists/specialists.service')
      this.specialistsService = this.moduleRef.get(SpecialistsService, { strict: false })
      const { PrismaService } = await import('../../prisma/prisma.service')
      this.prisma = this.moduleRef.get(PrismaService, { strict: false })
    } catch {
      this.logger.warn('DelegateSpecialistTool dependencies unavailable — tool disabled')
    }
  }

  get def(): ToolDefinition {
    return {
      name: 'delegate_to_specialist',
      displayName: 'Delegate to Specialist',
      description:
        'Hand a task to one of the user\'s named specialist agents (researcher, coder, writer, analyst, ops). Each has its own persona and monthly budget. Use when the user asks to involve a specific agent or when a subtask clearly fits a specialist\'s role.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          agentName: { type: 'string', description: 'Name of the specialist agent to delegate to' },
          task: { type: 'string', description: 'Complete, self-contained instruction for the specialist' },
        },
        required: ['agentName', 'task'],
      },
    }
  }

  async run(input: { agentName: string; task: string }, userId: string): Promise<ToolResult> {
    if (!this.agentService || !this.specialistsService || !this.prisma) {
      return { success: false, output: null, error: 'Specialist agents are unavailable on this server.' }
    }
    const name = String(input.agentName ?? '').trim()
    const task = String(input.task ?? '').trim()
    if (!name || !task) {
      return { success: false, output: null, error: 'agentName and task are required.' }
    }

    const agents = await this.specialistsService.list(userId)
    const agent = agents.find((a: { name: string }) => a.name.toLowerCase() === name.toLowerCase())
    if (!agent) {
      const known = agents.map((a: { name: string }) => a.name).join(', ') || 'none configured'
      return { success: false, output: null, error: `No specialist named "${name}". Available: ${known}` }
    }

    const budget = await this.specialistsService.canAfford(userId, agent.id)
    if (!budget.ok) {
      return { success: false, output: null, error: budget.reason }
    }

    const conversation = await this.prisma.conversation.create({
      data: { userId, title: `@${agent.name}: ${task.slice(0, 60)}` },
      select: { id: true },
    })

    let reply = ''
    let totalTokens = 0
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
          if (event === 'tokens') {
            const row = data as { totalTokens?: number }
            if (typeof row?.totalTokens === 'number') totalTokens = row.totalTokens
          }
        },
        systemPromptAppendix:
          `You are @${agent.name}, a ${agent.role} specialist on the user's agent team.` +
          (agent.personaPrompt ? `\n${agent.personaPrompt}` : ''),
      })
    } catch (error: any) {
      return { success: false, output: null, error: `Specialist run failed: ${error?.message ?? error}` }
    }

    await this.specialistsService.charge(userId, agent.id, totalTokens).catch(() => undefined)

    return {
      success: true,
      output: {
        agent: agent.name,
        conversationId: conversation.id,
        answer: reply.slice(0, 6000),
        tokensUsed: totalTokens,
        spentUsd: agent.spentUsd,
        budgetUsd: agent.monthlyBudgetUsd,
      },
    }
  }
}
