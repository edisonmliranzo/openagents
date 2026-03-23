import { Injectable } from '@nestjs/common'
import { LLM_MODELS, LLM_MODEL_OPTIONS, LLM_PROVIDER_CAPABILITIES } from '@openagents/shared'
import type { LLMProvider } from '@openagents/shared'
import { LLMService } from '../agent/llm.service'
import { MemoryService } from '../memory/memory.service'
import { PrismaService } from '../prisma/prisma.service'

export type ChannelCommandName = 'new' | 'status' | 'models' | 'memory' | 'help'

export interface ChannelCommandContext {
  userId: string
  sessionLabel: string
  channelLabel: string
  titleHint: string
  conversationId?: string | null
}

export interface ChannelCommandResult {
  command: ChannelCommandName
  reply: string
  conversationId: string | null
}

const SUPPORTED_COMMANDS = new Set<ChannelCommandName>(['new', 'status', 'models', 'memory', 'help'])
const MAX_MODEL_ITEMS = 6
const MAX_MEMORY_FACTS = 3
@Injectable()
export class ChannelCommandsService {
  constructor(
    private prisma: PrismaService,
    private memory: MemoryService,
    private llm: LLMService,
  ) {}

  buildHelpReply(channelLabel: string) {
    return [
      `${channelLabel} commands`,
      '/new start a fresh thread in this channel',
      '/status show the current thread id, activity, and runtime',
      '/models show the active provider/model and quick model options',
      '/memory show the current memory snapshot',
      '/help show this command list',
      'Messages without a leading slash are sent to the agent.',
    ].join('\n')
  }

  parseTextCommand(text: string): ChannelCommandName | null {
    const token = text.trim().split(/\s+/, 1)[0] ?? ''
    if (!token.startsWith('/')) return null
    return this.normalizeCommandName(token)
  }

  async maybeHandleTextCommand(text: string, context: ChannelCommandContext): Promise<ChannelCommandResult | null> {
    const command = this.parseTextCommand(text)
    if (!command) return null
    return this.handleNamedCommand(command, context)
  }

  async handleNamedCommand(
    commandName: string,
    context: ChannelCommandContext,
  ): Promise<ChannelCommandResult | null> {
    const command = this.normalizeCommandName(commandName)
    if (!command) return null

    switch (command) {
      case 'help':
        return {
          command,
          reply: this.buildHelpReply(context.channelLabel),
          conversationId: context.conversationId ?? null,
        }
      case 'new':
        return this.handleNewConversation(context)
      case 'status':
        return this.handleStatus(context)
      case 'models':
        return this.handleModels(context)
      case 'memory':
        return this.handleMemory(context)
      default:
        return null
    }
  }

  private async handleNewConversation(context: ChannelCommandContext): Promise<ChannelCommandResult> {
    const conversation = await this.prisma.conversation.create({
      data: {
        userId: context.userId,
        title: context.titleHint.slice(0, 80),
        sessionLabel: context.sessionLabel,
      },
      select: { id: true, title: true },
    })

    return {
      command: 'new',
      conversationId: conversation.id,
      reply: [
        `Started a new ${context.channelLabel.toLowerCase()} thread.`,
        `Thread: ${conversation.id}`,
        `Title: ${conversation.title ?? context.titleHint}`,
      ].join('\n'),
    }
  }

  private async handleStatus(context: ChannelCommandContext): Promise<ChannelCommandResult> {
    const conversation = await this.resolveConversation(context)
    const settings = await this.loadUserRuntime(context.userId)

    if (!conversation) {
      return {
        command: 'status',
        conversationId: null,
        reply: [
          `${context.channelLabel} status`,
          'No active thread yet.',
          `Runtime: ${this.describeRuntime(settings.provider, settings.model)}`,
          'Send a normal message or use /new to start a thread.',
        ].join('\n'),
      }
    }

    const messageCount = await this.prisma.message.count({
      where: { conversationId: conversation.id },
    })

    return {
      command: 'status',
      conversationId: conversation.id,
      reply: [
        `${context.channelLabel} status`,
        `Thread: ${conversation.id}`,
        `Title: ${conversation.title ?? context.titleHint}`,
        `Messages: ${messageCount}`,
        `Last activity: ${(conversation.lastMessageAt ?? conversation.updatedAt).toISOString()}`,
        `Runtime: ${this.describeRuntime(settings.provider, settings.model)}`,
      ].join('\n'),
    }
  }

  private async handleModels(context: ChannelCommandContext): Promise<ChannelCommandResult> {
    const settings = await this.loadUserRuntime(context.userId)
    const capability = LLM_PROVIDER_CAPABILITIES[settings.provider]
    const models = await this.listModelsForProvider(context.userId, settings.provider)
    const preview = models.slice(0, MAX_MODEL_ITEMS)
    const previewText = preview.length > 0 ? preview.join(', ') : settings.model

    return {
      command: 'models',
      conversationId: context.conversationId ?? null,
      reply: [
        `Current runtime: ${this.describeRuntime(settings.provider, settings.model)}`,
        `${capability.label} options: ${previewText}${models.length > preview.length ? ', ...' : ''}`,
        'Change provider/model in Settings > Config.',
      ].join('\n'),
    }
  }

  private async handleMemory(context: ChannelCommandContext): Promise<ChannelCommandResult> {
    const [files, facts] = await Promise.all([
      this.memory.listFiles(context.userId),
      this.memory.listFacts(context.userId, undefined, MAX_MEMORY_FACTS),
    ])

    const fileNames = files.map((file: { name: string }) => file.name).slice(0, 6)
    const factSummary = facts.length > 0
      ? facts
        .slice(0, MAX_MEMORY_FACTS)
        .map((fact: { entity: string; key: string; value: string }) => `${fact.entity}.${fact.key}: ${this.truncate(fact.value, 72)}`)
        .join(' | ')
      : 'No structured facts saved yet.'

    return {
      command: 'memory',
      conversationId: context.conversationId ?? null,
      reply: [
        'Memory snapshot',
        `Files: ${fileNames.length > 0 ? fileNames.join(', ') : 'none'}`,
        `Facts: ${factSummary}`,
        'Open the Memory page for full editing and review.',
      ].join('\n'),
    }
  }

  private async resolveConversation(context: ChannelCommandContext) {
    if (context.conversationId) {
      const current = await this.prisma.conversation.findUnique({
        where: { id: context.conversationId },
        select: {
          id: true,
          userId: true,
          title: true,
          lastMessageAt: true,
          updatedAt: true,
        },
      })
      if (current && current.userId === context.userId) {
        return current
      }
    }

    return this.prisma.conversation.findFirst({
      where: {
        userId: context.userId,
        sessionLabel: context.sessionLabel,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        lastMessageAt: true,
        updatedAt: true,
      },
    })
  }

  private async listModelsForProvider(userId: string, provider: LLMProvider): Promise<string[]> {
    if (provider !== 'ollama') {
      return [...(LLM_MODEL_OPTIONS[provider] as readonly string[])]
    }

    const ollamaKey = await this.prisma.llmApiKey.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'ollama',
        },
      },
      select: { baseUrl: true, isActive: true },
    })

    try {
      const models = await this.llm.listOllamaModels(
        ollamaKey?.isActive ? (ollamaKey.baseUrl ?? undefined) : undefined,
      )
      if (models.length > 0) return models
    } catch {
      // Fall back to static options when local discovery fails.
    }

    return [...(LLM_MODEL_OPTIONS.ollama as readonly string[])]
  }

  private async loadUserRuntime(userId: string): Promise<{ provider: LLMProvider; model: string }> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: {
        preferredProvider: true,
        preferredModel: true,
      },
    })
    const provider = this.normalizeProvider(settings?.preferredProvider) ?? 'anthropic'
    const model = settings?.preferredModel?.trim() || LLM_MODELS[provider].default
    return { provider, model }
  }

  private normalizeCommandName(raw: string): ChannelCommandName | null {
    const normalized = raw.trim().toLowerCase().replace(/^\//, '')
    return SUPPORTED_COMMANDS.has(normalized as ChannelCommandName)
      ? normalized as ChannelCommandName
      : null
  }

  private normalizeProvider(raw?: string | null): LLMProvider | null {
    if (!raw) return null
    const value = raw.trim().toLowerCase()
    return value in LLM_PROVIDER_CAPABILITIES ? value as LLMProvider : null
  }

  private describeRuntime(provider: LLMProvider, model: string) {
    return `${LLM_PROVIDER_CAPABILITIES[provider].label} ${model}`.trim()
  }

  private truncate(value: string, maxChars: number) {
    if (value.length <= maxChars) return value
    return `${value.slice(0, Math.max(0, maxChars - 3))}...`
  }

  private basename(value: string) {
    const normalized = value.replace(/[\\/]+$/, '')
    const parts = normalized.split(/[\\/]/).filter(Boolean)
    return parts[parts.length - 1] ?? value
  }
}
