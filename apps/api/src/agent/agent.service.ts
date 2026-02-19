import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from './llm.service'
import { ToolsService } from '../tools/tools.service'
import { MemoryService } from '../memory/memory.service'
import { ApprovalsService } from '../approvals/approvals.service'
import { UsersService } from '../users/users.service'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'
import { SHORT_TERM_MEMORY_LIMIT } from '@openagents/shared'
import type { LLMProvider } from '@openagents/shared'

export interface AgentRunParams {
  conversationId: string
  userId: string
  userMessage: string
  emit: (event: string, data: unknown) => void
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI agent with access to tools.
You can use tools to help the user accomplish tasks.
When you use a tool that requires approval, clearly explain what you're about to do and why.
After getting tool results, summarize them clearly and suggest next steps.
Keep your responses concise and action-oriented.`

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name)

  constructor(
    private prisma: PrismaService,
    private llm: LLMService,
    private tools: ToolsService,
    private memory: MemoryService,
    private approvals: ApprovalsService,
    private users: UsersService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  async run({ conversationId, userId, userMessage, emit }: AgentRunParams) {
    // 1. Save user message
    const userMsg = await this.prisma.message.create({
      data: { conversationId, role: 'user', content: userMessage, status: 'done' },
    })
    emit('message', { ...userMsg })

    // 2. Create agent run record
    const run = await this.prisma.agentRun.create({
      data: { conversationId, status: 'thinking' },
    })

    try {
      // 3. Load user settings (provider, custom prompt)
      const settings = await this.users.getSettings(userId)
      const provider = settings.preferredProvider as LLMProvider

      // 4. Build context: recent messages + long-term memory
      const recentMessages = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: SHORT_TERM_MEMORY_LIMIT,
      })

      const memories = await this.memory.getForUser(userId)
      const memoryContext = memories.map((m) => `[${m.type}] ${m.content}`).join('\n')

      const basePrompt = settings.customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT
      const systemPrompt = memoryContext
        ? `${basePrompt}\n\nUser context from memory:\n${memoryContext}`
        : basePrompt

      // 5. Get available tools for this user
      const availableTools = await this.tools.getAvailableForUser(userId)

      // 6. Build LLM messages (oldest first)
      const llmMessages = recentMessages
        .reverse()
        .filter((m) => m.role === 'user' || m.role === 'agent')
        .map((m) => ({
          role: (m.role === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content,
        }))

      emit('status', { status: 'thinking' })

      // 7. Call LLM with user's preferred provider + per-user key if configured
      const userLlmKey = await this.users.getRawLlmKey(userId, provider)
      const userApiKey = userLlmKey?.isActive ? (userLlmKey.apiKey ?? undefined) : undefined
      const userBaseUrl = userLlmKey?.isActive ? (userLlmKey.baseUrl ?? undefined) : undefined

      let activeProvider: LLMProvider = provider
      let activeUserApiKey = userApiKey
      let activeUserBaseUrl = userBaseUrl
      let response
      try {
        response = await this.llm.complete(llmMessages, availableTools, systemPrompt, provider, userApiKey, userBaseUrl)
      } catch (error: any) {
        const shouldFallbackToOllama =
          (provider === 'anthropic' || provider === 'openai')
          && typeof error?.message === 'string'
          && error.message.toLowerCase().includes('api key is not configured')

        if (!shouldFallbackToOllama) throw error

        this.logger.warn(`Provider ${provider} has no configured API key for user ${userId}; falling back to ollama.`)
        const ollamaKey = await this.users.getRawLlmKey(userId, 'ollama')
        const ollamaBaseUrl = ollamaKey?.isActive ? (ollamaKey.baseUrl ?? undefined) : undefined
        activeProvider = 'ollama'
        activeUserApiKey = undefined
        activeUserBaseUrl = ollamaBaseUrl
        emit('status', { status: 'thinking', provider: 'ollama', fallback: true })
        response = await this.llm.complete(
          llmMessages,
          availableTools,
          systemPrompt,
          activeProvider,
          activeUserApiKey,
          activeUserBaseUrl,
        )
      }

      // 8. Handle tool calls
      if (response.stopReason === 'tool_use' && response.toolCalls?.length) {
        for (const toolCall of response.toolCalls) {
          const toolDef = availableTools.find((t) => t.name === toolCall.name)

          if (!toolDef) {
            this.logger.warn(`Unknown tool requested: ${toolCall.name}`)
            continue
          }

          if (toolDef.requiresApproval) {
            const toolMsg = await this.prisma.message.create({
              data: {
                conversationId,
                role: 'tool',
                content: `Requesting to use tool: ${toolCall.name}`,
                status: 'pending',
                toolCallJson: toolCall as any,
              },
            })

            const approval = await this.approvals.create({
              conversationId,
              messageId: toolMsg.id,
              userId,
              toolName: toolCall.name,
              toolInput: toolCall.input,
            })

            await this.prisma.agentRun.update({
              where: { id: run.id },
              data: { status: 'waiting_approval' },
            })

            // Notify user that approval is needed
            this.notifications
              .create(userId, 'Action required', `Agent wants to use: ${toolCall.name}`, 'warning')
              .catch((e) => this.logger.error('Notification create failed', e))

            emit('approval_required', { approval, message: toolMsg })
            return
          }

          // Execute tool immediately
          await this.prisma.agentRun.update({
            where: { id: run.id },
            data: { status: 'running_tool' },
          })
          emit('status', { status: 'running_tool', tool: toolCall.name })

          const result = await this.tools.execute(toolCall.name, toolCall.input, userId)

          await this.prisma.message.create({
            data: {
              conversationId,
              role: 'tool',
              content: result.success ? JSON.stringify(result.output) : (result.error ?? 'Error'),
              status: result.success ? 'done' : 'error',
              toolCallJson: toolCall as any,
              toolResultJson: result as any,
            },
          })

          emit('tool_result', { tool: toolCall.name, result })
        }
      }

      // 9. Save agent response
      if (response.content) {
        const agentMsg = await this.prisma.message.create({
          data: { conversationId, role: 'agent', content: response.content, status: 'done' },
        })
        emit('message', agentMsg)

        // 10. Auto-title: set conversation title from first exchange if not yet set
        const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } })
        if (conv && !conv.title) {
          this.autoTitle(conversationId, userMessage, activeProvider, activeUserApiKey, activeUserBaseUrl).catch((e) =>
            this.logger.error('Auto-title failed', e),
          )
        }

        // 11. Update memory (async, non-blocking)
        this.memory.extractAndStore(userId, userMessage, response.content).catch((e) =>
          this.logger.error('Memory extraction failed', e),
        )
      }

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'done', finishedAt: new Date() },
      })

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      })

      // 12. Audit log
      this.audit
        .log(userId, 'agent_run', 'conversation', conversationId, { runId: run.id })
        .catch((e) => this.logger.error('Audit log failed', e))

      emit('status', { status: 'done' })
    } catch (err: any) {
      this.logger.error('Agent run failed', err)
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'error', finishedAt: new Date(), error: err.message },
      })
      throw err
    }
  }

  private async autoTitle(
    conversationId: string,
    firstMessage: string,
    provider: LLMProvider,
    userApiKey?: string,
    userBaseUrl?: string,
  ) {
    const prompt = firstMessage.length > 120 ? firstMessage.slice(0, 120) + '...' : firstMessage
    const response = await this.llm.complete(
      [{ role: 'user', content: `Generate a short title (5 words max) for a conversation that starts with: "${prompt}". Reply with only the title, no quotes.` }],
      [],
      'You are a helpful assistant that generates concise conversation titles.',
      provider,
      userApiKey,
      userBaseUrl,
    )
    if (response.content) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title: response.content.trim().slice(0, 80) },
      })
    }
  }
}
