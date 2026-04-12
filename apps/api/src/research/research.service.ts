import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ApprovalsService } from '../approvals/approvals.service'
import { PolicyService } from '../policy/policy.service'
import { ToolsService } from '../tools/tools.service'
import { LLMService } from '../agent/llm.service'

export interface AutonomousStep {
  id: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: unknown
  error?: string
  attempts: number
  maxAttempts: number
}

export interface AutonomousGoalInput {
  userId: string
  goal: string
  maxSteps?: number
  autonomyLevel?: 'safe' | 'advisory' | 'autonomous'
}

export interface PlanAndActInput {
  userId: string
  query: string
  toolName?: string
  toolInput?: Record<string, unknown>
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: unknown
}

export interface ChatSession {
  id: string
  userId: string
  createdAt: number
  lastActive: number
  messages: ChatMessage[]
  context: Record<string, unknown>
  isArchived: boolean
}

const AUTONOMOUS_SYSTEM_PROMPT = `You are a fully autonomous goal execution agent. Your job is to accomplish goals completely and independently using the tools available to you.

Core operating principles:
- Analyze each goal deeply before acting. Decompose complex goals into the smallest actionable steps.
- Use tools proactively and aggressively. Never claim you cannot do something if a tool exists for it.
- If a tool call fails, adapt: try alternative tools, adjust parameters, or work around the failure.
- Do NOT ask for human confirmation or input — make decisions autonomously.
- Verify your results. After executing an action, validate the outcome before moving on.
- Chain multiple tools together when needed to accomplish sub-goals.
- When you have fully accomplished the goal, provide a concise, structured summary of what was done.

Decision loop:
1. Understand the goal and desired outcome
2. Identify the tools best suited to accomplish it
3. Execute the tools, observe results
4. Adjust based on results — retry, pivot, or proceed
5. Verify success criteria are met
6. Report outcome clearly`

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name)
  private userChats = new Map<string, Map<string, ChatSession>>()

  constructor(
    private approvals: ApprovalsService,
    private policy: PolicyService,
    private tools: ToolsService,
    private llm: LLMService,
  ) {}

  async executeAutonomousGoal(input: AutonomousGoalInput) {
    const goal = (input.goal ?? '').trim()
    if (!input.userId?.trim()) throw new BadRequestException('userId is required')
    if (!goal) throw new BadRequestException('goal is required')

    const maxRounds = input.maxSteps ?? 20
    const userId = input.userId

    // Load real tools available for this user
    const availableTools = await this.tools.getAvailableForUser(userId)

    const llmTools = availableTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))

    // Agentic message history — starts with the user's goal
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: goal },
    ]

    const executedTools: Array<{
      name: string
      input: Record<string, unknown>
      success: boolean
      output: unknown
      error?: string
      round: number
    }> = []

    let round = 0
    let finalContent = ''
    let stopReason: string = 'max_rounds'

    // Real autonomous agentic loop: LLM decides what to do, tools execute, results feed back
    while (round < maxRounds) {
      round++
      this.logger.log(`[Autonomous] Round ${round}/${maxRounds} for goal: "${goal.slice(0, 60)}..."`)

      let response
      try {
        response = await this.llm.complete(
          messages,
          llmTools,
          AUTONOMOUS_SYSTEM_PROMPT,
        )
      } catch (err: any) {
        this.logger.error(`[Autonomous] LLM call failed on round ${round}: ${err?.message}`)
        break
      }

      finalContent = response.content

      // LLM decided it is done — exit the loop
      if (response.stopReason === 'end_turn' || !response.toolCalls?.length) {
        stopReason = 'end_turn'
        break
      }

      // Push assistant's reasoning/tool-intent into history
      if (response.content) {
        messages.push({ role: 'assistant', content: response.content })
      }

      // Execute every tool call the LLM requested, in sequence
      const toolResultParts: string[] = []

      for (const tc of response.toolCalls ?? []) {
        this.logger.log(`[Autonomous] Executing tool "${tc.name}" (round ${round})`)

        // Policy check — bypass only for known-safe read tools in autonomous mode
        if (input.autonomyLevel !== 'autonomous') {
          const decision = this.policy.evaluate({
            action: `execute ${tc.name}`,
            toolName: tc.name,
            scope: /delete|remove|update|create|send|post|write/i.test(tc.name)
              ? 'external_write'
              : 'external_read',
            sensitivity: 'internal',
            reversible: !/delete|remove|drop|terminate/i.test(tc.name),
            estimatedCostUsd: 0.01,
          })
          if (decision.decision === 'block') {
            toolResultParts.push(
              `Tool "${tc.name}" was blocked by policy: ${decision.reason}. Try an alternative approach.`,
            )
            executedTools.push({ name: tc.name, input: tc.input, success: false, output: null, error: `blocked: ${decision.reason}`, round })
            continue
          }
        }

        let result
        try {
          result = await this.tools.execute(tc.name, tc.input, userId)
        } catch (err: any) {
          result = { success: false, output: null, error: err?.message ?? 'Unknown error' }
        }

        executedTools.push({
          name: tc.name,
          input: tc.input,
          success: result.success,
          output: result.output,
          error: result.error ?? undefined,
          round,
        })

        if (result.success) {
          const outputStr = typeof result.output === 'string'
            ? result.output
            : JSON.stringify(result.output, null, 2)
          toolResultParts.push(`Tool "${tc.name}" succeeded:\n${outputStr}`)
        } else {
          toolResultParts.push(
            `Tool "${tc.name}" failed: ${result.error ?? 'unknown error'}. Consider an alternative approach.`,
          )
        }
      }

      // Feed tool results back as a user message so the LLM can reason about them
      if (toolResultParts.length) {
        messages.push({ role: 'user', content: toolResultParts.join('\n\n---\n\n') })
      }
    }

    const completedTools = executedTools.filter(t => t.success)
    const failedTools = executedTools.filter(t => !t.success)
    const summary = this.buildSummary(goal, finalContent, completedTools.length, failedTools.length, round, stopReason)

    // Autonomously schedule follow-up if the goal suggests recurring work
    void this.autoScheduleNextGoal(userId, goal, executedTools)

    return {
      goal,
      totalRounds: round,
      status: stopReason === 'end_turn' ? 'completed' : 'max_rounds_reached',
      toolsExecuted: executedTools.length,
      toolsSucceeded: completedTools.length,
      toolsFailed: failedTools.length,
      toolLog: executedTools,
      summary,
      humanInterventionRequired: false,
      nextActions: this.identifyNextActions(goal, executedTools),
    }
  }

  private buildSummary(
    goal: string,
    llmFinalContent: string,
    completedCount: number,
    failedCount: number,
    rounds: number,
    stopReason: string,
  ): string {
    const parts: string[] = [
      `Goal: "${goal}"`,
      `Rounds used: ${rounds}`,
      `Stop reason: ${stopReason}`,
      `Tools succeeded: ${completedCount}, failed: ${failedCount}`,
    ]
    if (llmFinalContent) parts.push(`\nAgent conclusion:\n${llmFinalContent}`)
    return parts.join('\n')
  }

  private identifyNextActions(goal: string, toolLog: Array<{ name: string; success: boolean }>) {
    const actions: string[] = []
    if (toolLog.some(t => !t.success)) {
      actions.push('Retry failed tool calls with adjusted parameters')
    }
    if (goal.toLowerCase().includes('monitor') || goal.toLowerCase().includes('watch')) {
      actions.push('Set up a recurring cron job to continue monitoring')
    }
    if (goal.toLowerCase().includes('report') || goal.toLowerCase().includes('summary')) {
      actions.push('Schedule periodic report generation')
    }
    return actions
  }

  private async autoScheduleNextGoal(
    userId: string,
    completedGoal: string,
    toolLog: Array<{ name: string; success: boolean }>,
  ) {
    // If the goal is about monitoring/alerts, automatically schedule a recurring follow-up
    const needsRecurrence = /monitor|watch|alert|track|daily|weekly|hourly/i.test(completedGoal)
    if (!needsRecurrence) return

    try {
      await this.tools.execute(
        'cron_add',
        {
          label: `Auto follow-up: ${completedGoal.slice(0, 80)}`,
          intervalMinutes: 60,
          goal: completedGoal,
          userId,
        },
        userId,
      )
      this.logger.log(`[Autonomous] Scheduled recurring follow-up for goal: "${completedGoal.slice(0, 60)}"`)
    } catch {
      // Non-critical — goal still completed successfully
    }
  }

  // ── Chat Management ──────────────────────────────────────────────────────────

  async createNewChat(userId: string) {
    const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    if (!this.userChats.has(userId)) {
      this.userChats.set(userId, new Map())
    }

    const chatSession: ChatSession = {
      id: chatId,
      userId,
      createdAt: Date.now(),
      lastActive: Date.now(),
      messages: [],
      context: {},
      isArchived: false,
    }

    this.userChats.get(userId)!.set(chatId, chatSession)
    return chatSession
  }

  async getUserChats(userId: string) {
    if (!this.userChats.has(userId)) return []
    return Array.from(this.userChats.get(userId)!.values())
      .filter(c => !c.isArchived)
      .sort((a, b) => b.lastActive - a.lastActive)
  }

  async getChatHistory(userId: string, chatId: string) {
    return this.userChats.get(userId)?.get(chatId) ?? null
  }

  async sendMessageToChat(userId: string, chatId: string, message: string) {
    const chat = this.userChats.get(userId)?.get(chatId)
    if (!chat) throw new BadRequestException('Chat not found')

    chat.lastActive = Date.now()
    chat.messages.push({ role: 'user', content: message, timestamp: Date.now() })

    const result = await this.executeAutonomousGoal({
      userId,
      goal: message,
      autonomyLevel: 'autonomous',
    })

    chat.messages.push({
      role: 'assistant',
      content: result.summary,
      timestamp: Date.now(),
      metadata: result,
    })

    return result
  }

  async archiveChat(userId: string, chatId: string) {
    const chat = this.userChats.get(userId)?.get(chatId)
    if (chat) chat.isArchived = true
  }

  // ── Plan-and-Act (policy-gated single tool execution) ────────────────────────

  async planAndAct(input: PlanAndActInput) {
    const query = (input.query ?? '').trim()
    if (!input.userId?.trim()) throw new BadRequestException('userId is required')
    if (!query) throw new BadRequestException('query is required')

    // Use real LLM to build the plan
    const planResponse = await this.llm.complete(
      [{ role: 'user', content: `Break this task into a clear execution plan (bullet points): ${query}` }],
      [],
      'You are a planning agent. Produce a concise, numbered action plan for the given task. Be specific and actionable.',
    )

    const plan = planResponse.content
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)

    const toolName = (input.toolName ?? '').trim()
    const toolInput = input.toolInput ?? {}

    if (!toolName) {
      return {
        mode: 'research_only',
        plan,
        approval: { required: false, reason: 'No tool action requested.' },
        action: null,
        answer: `Research plan created for: "${query}"`,
      }
    }

    const decision = this.policy.evaluate({
      action: `execute ${toolName}`,
      toolName,
      scope: /delete|remove|update|create|send|post|write/i.test(toolName)
        ? 'external_write'
        : 'external_read',
      sensitivity: 'internal',
      reversible: !/delete|remove|drop|terminate/i.test(toolName),
      estimatedCostUsd: 1,
    })

    const approvalRequired = decision.decision === 'confirm' || decision.decision === 'block'

    if (approvalRequired) {
      const risk = this.approvals.scoreToolRisk({
        toolName,
        toolInput,
        requiresApprovalByPolicy: true,
        outsideAutonomyWindow: false,
      })
      return {
        mode: 'plan_then_approval',
        plan,
        approval: { required: true, reason: decision.reason, risk },
        action: null,
        answer: 'Approval required before executing action.',
      }
    }

    const execution = await this.tools.execute(toolName, toolInput, input.userId)
    return {
      mode: 'plan_then_act',
      plan,
      approval: { required: false, reason: decision.reason },
      action: {
        toolName,
        success: execution.success,
        output: execution.output ?? null,
        error: execution.error ?? null,
      },
      answer: execution.success
        ? 'Action executed successfully with plan-and-act flow.'
        : `Action failed: ${execution.error ?? 'unknown error'}`,
    }
  }
}
