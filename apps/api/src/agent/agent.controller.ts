import { Controller, Delete, Post, Body, UseGuards, Req, Get, Query, Param, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { LLMService } from './llm.service'
import { AnswerCacheService } from './answer-cache.service'
import { UsersService } from '../users/users.service'
import { PrismaService } from '../prisma/prisma.service'
import type { LLMProvider } from '@openagents/shared'

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
  ) {}

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
