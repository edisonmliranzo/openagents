import { Controller, Delete, Post, Body, UseGuards, Req, Get, Query, Param, BadRequestException, HttpCode } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { LLMService } from './llm.service'
import { AnswerCacheService } from './answer-cache.service'
import { MemoryService } from '../memory/memory.service'
import { StudyService } from '../study/study.service'
import { UsersService } from '../users/users.service'
import { PrismaService } from '../prisma/prisma.service'
import { LLM_MODELS, type LLMProvider } from '@openagents/shared'

class TestLlmDto {
  @IsString() provider: string
  @IsString() @IsOptional() apiKey?: string
  @IsString() @IsOptional() baseUrl?: string
  @IsString() @IsOptional() model?: string
}

@ApiTags('agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(
    private llm: LLMService,
    private users: UsersService,
    private prisma: PrismaService,
    private answerCache: AnswerCacheService,
    private memory: MemoryService,
    private study: StudyService,
  ) {}

  @Post('suggestions')
  @HttpCode(200)
  async suggestions(@Req() req: any, @Body() body: { conversationId?: string }) {
    const conversationId = String(body?.conversationId ?? '').trim()
    if (!conversationId) return { suggestions: [] }
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId: req.user.id },
      select: { id: true },
    })
    if (!conv) return { suggestions: [] }

    const messages = await this.prisma.message.findMany({
      where: { conversationId, role: { in: ['user', 'agent'] } },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { role: true, content: true },
    })
    if (messages.length === 0) return { suggestions: [] }

    const transcript = messages
      .slice()
      .reverse()
      .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
      .join('\n')

    const settings = await this.users.getSettings(req.user.id)
    const provider = (settings.preferredProvider ?? 'ollama') as LLMProvider
    const key = await this.users.getRawLlmKey(req.user.id, provider).catch(() => null)
    const apiKey = key?.isActive ? (key.apiKey ?? key.loginPassword ?? undefined) : undefined
    const baseUrl = key?.isActive ? (key.baseUrl ?? undefined) : undefined

    try {
      const res = await this.llm.complete(
        [
          {
            role: 'user',
            content: `Conversation so far:\n${transcript}\n\nWrite exactly 3 short follow-up questions the user might naturally ask next. Each under 60 characters, plain text, one per line. No numbering, no quotes.`,
          },
        ],
        [],
        'You output exactly 3 lines and nothing else.',
        provider,
        apiKey,
        baseUrl,
        LLM_MODELS[provider].fast,
      )
      const lines = (res.content ?? '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^[\d.\-\s"'`]+/, '').trim())
        .filter(Boolean)
        .slice(0, 3)

      // Prefetch: warm the answer cache so clicking a chip feels instant.
      if (lines.length > 0) {
        void this.prefetchSuggestions(req.user.id, lines, provider, apiKey, baseUrl, settings.preferredModel ?? undefined).catch(() => undefined)
      }

      return { suggestions: lines }
    } catch {
      return { suggestions: [] }
    }
  }

  private async prefetchSuggestions(
    userId: string,
    questions: string[],
    provider: LLMProvider,
    apiKey?: string,
    baseUrl?: string,
    model?: string,
  ): Promise<void> {
    for (const question of questions.slice(0, 2)) {
      try {
        const warm = await this.llm.complete(
          [{ role: 'user', content: question }],
          [],
          'You are a helpful assistant. Answer directly and concisely.',
          provider,
          apiKey,
          baseUrl,
          model,
        )
        const answer = (warm.content ?? '').trim()
        if (!answer) continue
        await this.answerCache.store({
          userId,
          question,
          answer,
          provider,
          model: model ?? null,
          taskClass: 'general',
          usedTools: false,
        })
      } catch {
        // Prefetch is best-effort; a miss just means the real run happens.
      }
    }
  }

  @Post('feedback')
  @HttpCode(200)
  async feedback(@Req() req: any, @Body() body: { messageId?: string; vote?: string }) {
    const vote = String(body?.vote ?? '')
    const messageId = String(body?.messageId ?? '').trim()
    if (vote !== 'up' && vote !== 'down') throw new BadRequestException('vote must be up or down')
    if (!messageId) throw new BadRequestException('messageId is required')

    if (vote === 'down') {
      const msg = await this.prisma.message.findFirst({
        where: { id: messageId, conversation: { userId: req.user.id } },
        select: { content: true, conversationId: true },
      })
      if (msg) {
        const prevUser = await this.prisma.message.findFirst({
          where: { conversationId: msg.conversationId, role: 'user' },
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        }).catch(() => null)
        void this.study
          .logGap(req.user.id, prevUser?.content?.slice(0, 80) ?? msg.content.slice(0, 80), 'user gave a thumbs-down')
          .catch(() => undefined)
        await this.memory
          .upsertFact(req.user.id, {
            entity: 'feedback',
            key: `dissatisfied-${Date.now()}`,
            value: `User was unhappy with an answer about: ${msg.content.slice(0, 160)}. Do not repeat that style of answer.`,
            confidence: 0.8,
            sourceRef: messageId,
          })
          .catch(() => undefined)
      }
    }
    return { ok: true }
  }

  @Get('intelligence')
  async intelligence(@Req() req: any) {
    const [cache, rows] = await Promise.all([
      this.answerCache.stats(req.user.id),
      this.prisma.routingOutcome.findMany({
        where: { userId: req.user.id },
        select: { taskClass: true, model: true, durationMs: true, success: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ])

    const buckets = new Map<string, { samples: number; successes: number; totalMs: number }>()
    for (const row of rows) {
      const key = `${row.taskClass}::${row.model}`
      const entry = buckets.get(key) ?? { samples: 0, successes: 0, totalMs: 0 }
      entry.samples += 1
      if (row.success) entry.successes += 1
      entry.totalMs += row.durationMs
      buckets.set(key, entry)
    }

    return {
      cache,
      routing: [...buckets.entries()].slice(0, 50).map(([key, entry]) => ({
        taskClass: key.split('::')[0],
        model: key.split('::').slice(1).join('::'),
        samples: entry.samples,
        avgDurationMs: Math.round(entry.totalMs / entry.samples),
        successRate: Number((entry.successes / entry.samples).toFixed(2)),
      })),
    }
  }

  @Delete('cache')
  clearCache(@Req() req: any) {
    return this.answerCache.clear(req.user.id)
  }

  @Post('branch')
  @UseGuards(JwtAuthGuard)
  async branchSession(
    @Req() req: any,
    @Body() body: { sessionId: string; fromMessageIndex?: number; prompt: string },
  ) {
    const userId = req.user?.sub ?? req.user?.id

    // Fetch source conversation (must belong to user)
    const sourceConversation = await this.prisma.conversation
      .findFirst({ where: { id: body.sessionId, userId } })
      .catch(() => null)

    // Fetch messages up to the given index
    const allMessages = sourceConversation
      ? await this.prisma.message
          .findMany({
            where: { conversationId: body.sessionId },
            orderBy: { createdAt: 'asc' },
          })
          .catch(() => [])
      : []

    const cutoff = body.fromMessageIndex ?? allMessages.length
    const messages = allMessages.slice(0, cutoff)

    // Create a new branched conversation
    const branchTitle = sourceConversation
      ? `Branch of: ${sourceConversation.title ?? sourceConversation.id.slice(0, 8)}`
      : 'Branched conversation'

    const newConversation = await this.prisma.conversation
      .create({
        data: {
          userId,
          title: branchTitle,
        },
      })
      .catch(() => null)

    // Copy messages into the new conversation
    if (newConversation && messages.length > 0) {
      await this.prisma.message
        .createMany({
          data: messages.map((msg) => ({
            conversationId: newConversation.id,
            role: msg.role,
            content: msg.content,
            status: 'done',
            toolCallJson: msg.toolCallJson,
            toolResultJson: msg.toolResultJson,
          })),
        })
        .catch(() => null)
    }

    // Add the branch prompt as a new user message
    if (newConversation && body.prompt) {
      await this.prisma.message
        .create({
          data: {
            conversationId: newConversation.id,
            role: 'user',
            content: body.prompt,
            status: 'done',
          },
        })
        .catch(() => null)
    }

    return {
      branchSessionId: newConversation?.id ?? null,
      copiedMessages: messages.length,
      status: 'branched',
    }
  }

  @Get('ollama-models')
  async listOllamaModels(@Req() req: any, @Query('baseUrl') baseUrl?: string) {
    let resolvedBaseUrl = baseUrl?.trim()

    if (!resolvedBaseUrl) {
      const stored = await this.users.getRawLlmKey(req.user.id, 'ollama')
      if (stored?.isActive && stored.baseUrl) {
        resolvedBaseUrl = stored.baseUrl
      }
    }

    try {
      const models = await this.llm.listOllamaModels(resolvedBaseUrl)
      return { models }
    } catch (error: any) {
      throw new BadRequestException(error?.message ?? 'Failed to load Ollama models.')
    }
  }

  @Get('models/:provider')
  async listProviderModels(@Req() req: any, @Param('provider') provider: string, @Query('baseUrl') baseUrl?: string) {
    const trimmedBase = baseUrl?.trim() || undefined
    let apiKey: string | undefined
    let resolvedBase = trimmedBase

    if (!trimmedBase) {
      const stored = await this.users.getRawLlmKey(req.user.id, provider).catch(() => null)
      if (stored?.isActive) {
        apiKey = stored.apiKey ?? stored.loginPassword ?? undefined
        resolvedBase = stored.baseUrl ?? undefined
      }
    }

    return this.llm.listProviderModels(provider as LLMProvider, apiKey, resolvedBase)
  }

  @Post('test-llm')
  async testLlm(@Body() dto: TestLlmDto, @Req() req: any) {
    let apiKey = dto.apiKey
    let baseUrl = dto.baseUrl

    // If no key provided in the request, fall back to the user's stored key
    if (!apiKey && !baseUrl) {
      const stored = await this.users.getRawLlmKey(req.user.id, dto.provider)
      if (stored?.isActive) {
        apiKey = stored.apiKey ?? stored.loginPassword ?? undefined
        baseUrl = stored.baseUrl ?? undefined
      }
    }

    return this.llm.testConnection(dto.provider as LLMProvider, apiKey, baseUrl, dto.model)
  }
}
