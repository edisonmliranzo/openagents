import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LLMService } from './llm.service'
import { ToolsService } from '../tools/tools.service'
import { MemoryService } from '../memory/memory.service'
import { ApprovalsService } from '../approvals/approvals.service'
import { UsersService } from '../users/users.service'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service'
import { DataLineageService } from '../lineage/lineage.service'
import { LLM_MODELS, SHORT_TERM_MEMORY_LIMIT } from '@openagents/shared'
import type { LLMProvider, LineageToolInfluence, ToolResult } from '@openagents/shared'

export interface AgentRunParams {
  conversationId: string
  userId: string
  userMessage: string
  emit: (event: string, data: unknown) => void
  systemPromptAppendix?: string
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI agent with access to tools.
You can use tools to help the user accomplish tasks.
If a user request maps to available tools, prefer using tools before claiming limitations.
Do not claim a capability is unavailable unless the tool is truly missing or the tool call returned an error.
When you use a tool that requires approval, clearly explain what you're about to do and why.
After getting tool results, summarize them clearly and suggest next steps.
For web research, include source URLs from tool results in your answer when available.
For complex tasks, decompose into plan -> execute -> verify before finalizing.
Keep your responses concise and action-oriented.`
const DEFAULT_MAX_TOOL_ROUNDS = 6
const DEFAULT_TOOL_RETRY_ATTEMPTS = 1
const DEFAULT_TOOL_RETRY_BASE_DELAY_MS = 500
const MANUS_LITE_MAX_TOOL_ROUNDS = 10
const MANUS_LITE_TOOL_RETRY_ATTEMPTS = 2
const MANUS_LITE_TOOL_RETRY_BASE_DELAY_MS = 350
const MANUS_LITE_DEFAULT_PROVIDER: LLMProvider = 'ollama'

interface AgentRunToolMetric {
  name: string
  requiresApproval: boolean
  status: 'executed' | 'failed' | 'pending_approval'
  attempts?: number
  recoveredByRetry?: boolean
}

interface AgentRunMetrics {
  provider: string
  model: string | null
  llmCalls: number
  inputTokens: number
  outputTokens: number
  approvalsRequested: number
  fallbackToOllama: boolean
  maxToolRounds: number
  toolRetryAttemptsConfigured: number
  toolRoundsUsed: number
  toolRetries: number
  toolRecoveries: number
  manusLiteEnabled: boolean
  manusLiteRoutingApplied: boolean
  autonomyScheduleEnabled: boolean
  autonomyWithinWindow: boolean
  autonomyTimezone: string
  autonomyReason: string
  autonomyFallbackApprovals: number
  autoApprovedLowRisk: number
  riskLow: number
  riskMedium: number
  riskHigh: number
  toolCalls: AgentRunToolMetric[]
}

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
    private lineage: DataLineageService,
  ) {}

  async run({ conversationId, userId, userMessage, emit, systemPromptAppendix }: AgentRunParams) {
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
      const routing = this.resolveRoutingPreset(settings.preferredProvider, settings.preferredModel)
      const provider = routing.provider
      const preferredModel = routing.model
      let autonomyStatus = await this.memory.getAutonomyStatus(userId)

      // 4. Build context: recent messages + long-term memory
      const recentMessages = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: SHORT_TERM_MEMORY_LIMIT,
      })

      const [memories, filesystemContext] = await Promise.all([
        this.memory.getForUser(userId),
        this.memory.buildFilesystemContext(userId),
      ])
      const lineageMemoryFiles = filesystemContext
        ? ['SOUL.md', 'USER.md', 'MEMORY.md', 'HEARTBEAT.md']
        : []
      const lineageMemorySummaryIds = memories.map((memory) => memory.id)
      const lineageTools: LineageToolInfluence[] = []
      const lineageApprovals: string[] = []
      const lineageExternalSources = new Set<string>()
      const memorySections = [
        memories.length ? memories.map((m) => `[${m.type}] ${m.content}`).join('\n') : '',
        filesystemContext ? `Filesystem memory:\n${filesystemContext}` : '',
      ].filter(Boolean)
      const memoryContext = memorySections.join('\n\n')

      const basePrompt = settings.customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT
      const systemPrompt = memoryContext
        ? `${basePrompt}\n\nUser context from memory:\n${memoryContext}`
        : basePrompt
      const effectiveSystemPrompt = systemPromptAppendix?.trim()
        ? `${systemPrompt}\n\n${systemPromptAppendix.trim()}`
        : systemPrompt

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
      const userApiKey = userLlmKey?.isActive
        ? (userLlmKey.apiKey ?? undefined)
        : undefined
      const userBaseUrl = userLlmKey?.isActive ? (userLlmKey.baseUrl ?? undefined) : undefined

      const maxToolRounds = this.readToolLoopSetting(
        'AGENT_MAX_TOOL_ROUNDS',
        DEFAULT_MAX_TOOL_ROUNDS,
        MANUS_LITE_MAX_TOOL_ROUNDS,
        1,
        12,
      )
      const toolRetryAttempts = this.readToolLoopSetting(
        'AGENT_TOOL_RETRY_ATTEMPTS',
        DEFAULT_TOOL_RETRY_ATTEMPTS,
        MANUS_LITE_TOOL_RETRY_ATTEMPTS,
        0,
        4,
      )
      let activeProvider: LLMProvider = provider
      let activeUserApiKey = userApiKey
      let activeUserBaseUrl = userBaseUrl
      let activeModel = preferredModel
      const runMetrics: AgentRunMetrics = {
        provider,
        model: preferredModel ?? null,
        llmCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        approvalsRequested: 0,
        fallbackToOllama: false,
        maxToolRounds,
        toolRetryAttemptsConfigured: toolRetryAttempts,
        toolRoundsUsed: 0,
        toolRetries: 0,
        toolRecoveries: 0,
        manusLiteEnabled: this.isManusLiteEnabled(),
        manusLiteRoutingApplied: routing.applied,
        autonomyScheduleEnabled: autonomyStatus.scheduleEnabled,
        autonomyWithinWindow: autonomyStatus.withinWindow,
        autonomyTimezone: autonomyStatus.timezone,
        autonomyReason: autonomyStatus.reason,
        autonomyFallbackApprovals: 0,
        autoApprovedLowRisk: 0,
        riskLow: 0,
        riskMedium: 0,
        riskHigh: 0,
        toolCalls: [],
      }
      const completeWithProviderFallback = async (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
        runMetrics.llmCalls += 1
        runMetrics.inputTokens += this.estimateTokens(effectiveSystemPrompt)
        runMetrics.inputTokens += messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0)

        try {
          return await this.llm.complete(
            messages,
            availableTools,
            effectiveSystemPrompt,
            activeProvider,
            activeUserApiKey,
            activeUserBaseUrl,
            activeModel,
          )
        } catch (error: any) {
          const shouldFallbackToOllama =
            activeProvider !== 'ollama'
            && typeof error?.message === 'string'
            && error.message.toLowerCase().includes('api key is not configured')

          if (!shouldFallbackToOllama) throw error

          this.logger.warn(`Provider ${activeProvider} has no configured API key for user ${userId}; falling back to ollama.`)
          const ollamaKey = await this.users.getRawLlmKey(userId, 'ollama')
          const ollamaBaseUrl = ollamaKey?.isActive ? (ollamaKey.baseUrl ?? undefined) : undefined
          runMetrics.fallbackToOllama = true
          activeProvider = 'ollama'
          activeUserApiKey = undefined
          activeUserBaseUrl = ollamaBaseUrl
          activeModel = undefined
          emit('status', { status: 'thinking', provider: 'ollama', fallback: true })
          return this.llm.complete(
            messages,
            availableTools,
            effectiveSystemPrompt,
            activeProvider,
            activeUserApiKey,
            activeUserBaseUrl,
            activeModel,
          )
        }
      }

      const llmWorkingMessages = [...llmMessages]
      let finalResponseContent = ''
      let toolRound = 0

      while (toolRound < maxToolRounds) {
        const response = await completeWithProviderFallback(llmWorkingMessages)

        if (response.content?.trim()) {
          runMetrics.outputTokens += this.estimateTokens(response.content.trim())
          finalResponseContent = response.content.trim()
          llmWorkingMessages.push({ role: 'assistant', content: response.content.trim() })
        }

        if (response.stopReason !== 'tool_use' || !response.toolCalls?.length) {
          break
        }

        toolRound += 1
        let executedAnyTool = false

        for (const toolCall of response.toolCalls) {
          const toolDef = availableTools.find((t) => t.name === toolCall.name)

          if (!toolDef) {
            this.logger.warn(`Unknown tool requested: ${toolCall.name}`)
            llmWorkingMessages.push({
              role: 'assistant',
              content: `Tool ${toolCall.name} is unavailable in this environment.`,
            })
            continue
          }

          autonomyStatus = await this.memory.getAutonomyStatus(userId)
          runMetrics.autonomyScheduleEnabled = autonomyStatus.scheduleEnabled
          runMetrics.autonomyWithinWindow = autonomyStatus.withinWindow
          runMetrics.autonomyTimezone = autonomyStatus.timezone
          runMetrics.autonomyReason = autonomyStatus.reason
          const outsideAutonomyWindow = !toolDef.requiresApproval && !autonomyStatus.withinWindow
          const risk = this.approvals.scoreToolRisk({
            toolName: toolCall.name,
            toolInput: toolCall.input,
            requiresApprovalByPolicy: toolDef.requiresApproval,
            outsideAutonomyWindow,
          })
          const autoApprovedLowRisk = this.approvals.shouldAutoApproveLowRisk({
            riskLevel: risk.level,
            withinAutonomyWindow: autonomyStatus.withinWindow,
            requiresApprovalByPolicy: toolDef.requiresApproval,
          })
          const requiresApproval = toolDef.requiresApproval || outsideAutonomyWindow || !autoApprovedLowRisk

          if (risk.level === 'low') runMetrics.riskLow += 1
          else if (risk.level === 'medium') runMetrics.riskMedium += 1
          else runMetrics.riskHigh += 1
          if (autoApprovedLowRisk) runMetrics.autoApprovedLowRisk += 1

          this.approvals.recordRiskState(userId, {
            toolName: toolCall.name,
            level: risk.level,
            score: risk.score,
            reason: risk.reason,
            autoApproved: autoApprovedLowRisk,
            autonomyWithinWindow: autonomyStatus.withinWindow,
          })

          if (requiresApproval) {
            runMetrics.approvalsRequested += 1
            if (outsideAutonomyWindow) {
              runMetrics.autonomyFallbackApprovals += 1
            }
            runMetrics.toolCalls.push({
              name: toolCall.name,
              requiresApproval: true,
              status: 'pending_approval',
            })
            this.addExternalSources(lineageExternalSources, toolCall.input)
            const toolMsg = await this.prisma.message.create({
              data: {
                conversationId,
                role: 'tool',
                content: outsideAutonomyWindow
                  ? `Outside autonomy window. Requesting approval to use tool: ${toolCall.name} (risk: ${risk.level}, score: ${risk.score}).`
                  : `Requesting to use tool: ${toolCall.name} (risk: ${risk.level}, score: ${risk.score}).`,
                status: 'pending',
                toolCallJson: JSON.stringify(toolCall),
                metadata: JSON.stringify({
                  riskLevel: risk.level,
                  riskScore: risk.score,
                  riskReason: risk.reason,
                  autonomyWithinWindow: autonomyStatus.withinWindow,
                }),
              },
            })

            const approval = await this.approvals.create({
              conversationId,
              messageId: toolMsg.id,
              userId,
              toolName: toolCall.name,
              toolInput: toolCall.input,
            })
            lineageApprovals.push(approval.id)
            lineageTools.push({
              toolName: toolCall.name,
              status: 'pending_approval',
              requiresApproval: true,
              approvalId: approval.id,
              ...(this.compactRecord(toolCall.input) ? { input: this.compactRecord(toolCall.input)! } : {}),
            })

            await this.prisma.agentRun.update({
              where: { id: run.id },
              data: {
                status: 'waiting_approval',
                metadata: this.serializeRunMetrics(runMetrics, activeProvider, activeModel),
              },
            })

            this.notifications
              .create(
                userId,
                'Action required',
                outsideAutonomyWindow
                  ? `Outside autonomy window (${autonomyStatus.timezone}). Approve tool: ${toolCall.name}`
                  : `Agent wants to use: ${toolCall.name} (risk: ${risk.level}).`,
                'warning',
              )
              .catch((e) => this.logger.error('Notification create failed', e))

            emit('approval_required', {
              approval,
              message: toolMsg,
              risk,
              autonomy: outsideAutonomyWindow ? autonomyStatus : undefined,
            })
            return
          }

          await this.prisma.agentRun.update({
            where: { id: run.id },
            data: { status: 'running_tool' },
          })
          emit('status', { status: 'running_tool', tool: toolCall.name })

          const toolExecution = await this.executeToolWithRetry({
            toolName: toolCall.name,
            toolInput: toolCall.input,
            userId,
            maxRetries: toolRetryAttempts,
            emit,
          })
          const result = toolExecution.result
          runMetrics.toolRetries += Math.max(0, toolExecution.attempts - 1)
          if (toolExecution.recoveredByRetry) {
            runMetrics.toolRecoveries += 1
          }
          const resultContent = result.success
            ? this.renderToolData(result.output)
            : this.renderToolData({
                error: result.error ?? 'Error',
                attempts: toolExecution.attempts,
                retryable: this.isRetryableToolError(result.error),
                output: result.output,
              })

          runMetrics.toolCalls.push({
            name: toolCall.name,
            requiresApproval: false,
            status: result.success ? 'executed' : 'failed',
            attempts: toolExecution.attempts,
            recoveredByRetry: toolExecution.recoveredByRetry,
          })
          this.addExternalSources(lineageExternalSources, toolCall.input)
          this.addExternalSources(lineageExternalSources, result.output)
          lineageTools.push({
            toolName: toolCall.name,
            status: result.success ? 'executed' : 'failed',
            requiresApproval: false,
            ...(this.compactRecord(toolCall.input) ? { input: this.compactRecord(toolCall.input)! } : {}),
            outputPreview: resultContent ?? null,
            error: result.success ? null : (result.error ?? 'Tool execution failed'),
          })

          await this.prisma.message.create({
            data: {
              conversationId,
              role: 'tool',
              content: resultContent,
              status: result.success ? 'done' : 'error',
              toolCallJson: JSON.stringify(toolCall),
              toolResultJson: JSON.stringify({
                ...result,
                attempts: toolExecution.attempts,
                recoveredByRetry: toolExecution.recoveredByRetry,
              }),
            },
          })

          emit('tool_result', {
            tool: toolCall.name,
            result,
            attempts: toolExecution.attempts,
            recoveredByRetry: toolExecution.recoveredByRetry,
          })
          llmWorkingMessages.push({
            role: 'assistant',
            content: result.success
              ? `Tool result for ${toolCall.name}:\n${resultContent}`
              : `Tool ${toolCall.name} failed after ${toolExecution.attempts} attempt(s).\nTool result:\n${resultContent}\nAdjust inputs or choose an alternative tool before finalizing.`,
          })
          executedAnyTool = true
        }

        if (!executedAnyTool) {
          break
        }
      }

      if (toolRound >= maxToolRounds) {
        this.logger.warn(`Reached max tool rounds (${maxToolRounds}) for run ${run.id}`)
      }
      runMetrics.toolRoundsUsed = toolRound

      if (!finalResponseContent) {
        finalResponseContent = toolRound > 0
          ? 'Completed tool execution.'
          : 'I could not generate a response.'
      }

      // 9. Save agent response
      if (finalResponseContent) {
        const agentMsg = await this.prisma.message.create({
          data: { conversationId, role: 'agent', content: finalResponseContent, status: 'done' },
        })
        emit('message', agentMsg)
        await this.lineage.recordMessage({
          userId,
          conversationId,
          messageId: agentMsg.id,
          source: 'agent',
          runId: run.id,
          memoryFiles: lineageMemoryFiles,
          memorySummaryIds: lineageMemorySummaryIds,
          tools: lineageTools,
          approvals: lineageApprovals,
          externalSources: [...lineageExternalSources],
          notes: [
            `provider:${activeProvider}`,
            `toolRounds:${toolRound}`,
            `fallbackToOllama:${runMetrics.fallbackToOllama}`,
          ],
        }).catch((error) => {
          this.logger.warn(`Failed to record lineage for message ${agentMsg.id}: ${this.safeError(error)}`)
        })

        // 10. Auto-title: set conversation title from first exchange if not yet set
        const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } })
        if (conv && !conv.title) {
          this.autoTitle(
            conversationId,
            userMessage,
            activeProvider,
            activeUserApiKey,
            activeUserBaseUrl,
            activeModel,
          ).catch((e) =>
            this.logger.error('Auto-title failed', e),
          )
        }

        // 11. Update memory (async, non-blocking)
        this.memory.extractAndStore(userId, userMessage, finalResponseContent).catch((e) =>
          this.logger.error('Memory extraction failed', e),
        )
      }

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'done',
          finishedAt: new Date(),
          metadata: this.serializeRunMetrics(runMetrics, activeProvider, activeModel),
        },
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
        data: {
          status: 'error',
          finishedAt: new Date(),
          error: err.message,
          metadata: JSON.stringify({ error: err.message }),
        },
      })
      throw err
    }
  }

  private async executeToolWithRetry(input: {
    toolName: string
    toolInput: Record<string, unknown>
    userId: string
    maxRetries: number
    emit: (event: string, data: unknown) => void
  }): Promise<{ result: ToolResult; attempts: number; recoveredByRetry: boolean }> {
    let attempts = 0
    let result: ToolResult = { success: false, output: null, error: 'Tool did not execute.' }

    while (attempts <= input.maxRetries) {
      attempts += 1
      result = await this.tools.execute(input.toolName, input.toolInput, input.userId)
      if (result.success) {
        return {
          result,
          attempts,
          recoveredByRetry: attempts > 1,
        }
      }

      const canRetry = attempts <= input.maxRetries
      const retryable = this.isRetryableToolError(result.error)
      if (!canRetry || !retryable) break

      const delayMs = this.computeToolRetryDelayMs(attempts)
      input.emit('status', {
        status: 'retrying_tool',
        tool: input.toolName,
        attempt: attempts + 1,
        delayMs,
        reason: result.error ?? 'retryable tool failure',
      })
      await this.sleep(delayMs)
    }

    return {
      result,
      attempts,
      recoveredByRetry: false,
    }
  }

  private isRetryableToolError(rawError: unknown) {
    if (typeof rawError !== 'string') return false
    const message = rawError.toLowerCase()
    if (!message) return false
    if (message.includes('unknown tool')) return false
    if (/http\s*5\d\d/.test(message)) return true
    return [
      'timeout',
      'timed out',
      'network',
      'fetch failed',
      'connection reset',
      'econnreset',
      'etimedout',
      'temporarily unavailable',
      '429',
      'rate limit',
      'service unavailable',
      'gateway timeout',
      'bad gateway',
    ].some((pattern) => message.includes(pattern))
  }

  private computeToolRetryDelayMs(attempt: number) {
    const base = this.readToolLoopSetting(
      'AGENT_TOOL_RETRY_BASE_DELAY_MS',
      DEFAULT_TOOL_RETRY_BASE_DELAY_MS,
      MANUS_LITE_TOOL_RETRY_BASE_DELAY_MS,
      100,
      10_000,
    )
    return Math.min(base * Math.max(1, attempt), 12_000)
  }

  private readToolLoopSetting(
    envName: string,
    fallback: number,
    manusLitePreset: number,
    min: number,
    max: number,
  ) {
    const parsed = Number.parseInt(process.env[envName] ?? '', 10)
    const hasEnvValue = Number.isFinite(parsed)
    const normalized = hasEnvValue
      ? Math.max(min, Math.min(parsed, max))
      : fallback

    if (!this.isManusLiteEnabled()) {
      return normalized
    }

    const shouldApplyPreset = !hasEnvValue || normalized === fallback
    if (!shouldApplyPreset) {
      return normalized
    }
    return Math.max(min, Math.min(manusLitePreset, max))
  }

  private resolveRoutingPreset(rawProvider?: string | null, rawModel?: string | null) {
    const provider = this.normalizeProvider(rawProvider) ?? 'anthropic'
    const model = rawModel?.trim() || undefined

    if (!this.isManusLiteEnabled()) {
      return { provider, model, applied: false }
    }

    const forceRouting = this.readBooleanEnv('MANUS_LITE_FORCE_ROUTING', false)
    const onSchemaDefaults = provider === 'anthropic'
      && (!model || model === LLM_MODELS.anthropic.default)
    if (!forceRouting && !onSchemaDefaults) {
      return { provider, model, applied: false }
    }

    const presetProvider = this.resolveManusLiteProvider()
    return {
      provider: presetProvider,
      model: this.resolveManusLiteModel(presetProvider),
      applied: true,
    }
  }

  private resolveManusLiteProvider(): LLMProvider {
    const fromEnv = this.normalizeProvider(process.env.MANUS_LITE_PROVIDER)
    return fromEnv ?? MANUS_LITE_DEFAULT_PROVIDER
  }

  private resolveManusLiteModel(provider: LLMProvider) {
    const explicit = process.env.MANUS_LITE_MODEL?.trim()
    if (explicit) return explicit
    return LLM_MODELS[provider].fast
  }

  private normalizeProvider(value?: string | null): LLMProvider | null {
    const normalized = (value ?? '').trim().toLowerCase()
    if (
      normalized === 'anthropic'
      || normalized === 'openai'
      || normalized === 'google'
      || normalized === 'ollama'
      || normalized === 'minimax'
    ) {
      return normalized
    }
    return null
  }

  private isManusLiteEnabled() {
    return this.readBooleanEnv('MANUS_LITE', false)
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const raw = process.env[name]
    if (raw == null) return fallback
    const normalized = raw.trim().toLowerCase()
    return normalized === '1'
      || normalized === 'true'
      || normalized === 'yes'
      || normalized === 'on'
  }

  private async sleep(ms: number) {
    if (ms <= 0) return
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private renderToolData(data: unknown) {
    if (data == null) return ''
    if (typeof data === 'string') return data.slice(0, 4000)
    try {
      const serialized = JSON.stringify(data, null, 2)
      return serialized.length > 4000 ? `${serialized.slice(0, 4000)}...` : serialized
    } catch {
      return String(data).slice(0, 4000)
    }
  }

  private estimateTokens(text: string) {
    return Math.max(0, Math.ceil((text ?? '').length / 4))
  }

  private serializeRunMetrics(metrics: AgentRunMetrics, provider: LLMProvider, model?: string) {
    return JSON.stringify({
      ...metrics,
      provider,
      model: model ?? null,
      estimatedLlmCostOnly: true,
    })
  }

  private compactRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const out: Record<string, unknown> = {}
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20)
    for (const [key, raw] of entries) {
      const clippedKey = key.slice(0, 80)
      if (typeof raw === 'string') {
        out[clippedKey] = raw.slice(0, 500)
        continue
      }
      if (typeof raw === 'number' || typeof raw === 'boolean' || raw == null) {
        out[clippedKey] = raw
        continue
      }
      try {
        out[clippedKey] = JSON.parse(JSON.stringify(raw))
      } catch {
        out[clippedKey] = String(raw).slice(0, 500)
      }
    }
    return out
  }

  private addExternalSources(target: Set<string>, value: unknown) {
    for (const source of this.lineage.extractExternalSources(value)) {
      if (!source) continue
      target.add(source)
      if (target.size >= 80) break
    }
  }

  private safeError(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
  }

  private async autoTitle(
    conversationId: string,
    firstMessage: string,
    provider: LLMProvider,
    userApiKey?: string,
    userBaseUrl?: string,
    model?: string,
  ) {
    const prompt = firstMessage.length > 120 ? firstMessage.slice(0, 120) + '...' : firstMessage
    const response = await this.llm.complete(
      [{ role: 'user', content: `Generate a short title (5 words max) for a conversation that starts with: "${prompt}". Reply with only the title, no quotes.` }],
      [],
      'You are a helpful assistant that generates concise conversation titles.',
      provider,
      userApiKey,
      userBaseUrl,
      model,
    )
    if (response.content) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title: response.content.trim().slice(0, 80) },
      })
    }
  }
}
