import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import type { Response } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { PrismaService } from '../prisma/prisma.service'
import { AgentService } from '../agent/agent.service'
import { LLM_MODELS } from '@openagents/shared'

/**
 * OpenAI-compatible API — the nanobot "Agent API" pattern.
 *
 * `POST /v1/chat/completions` lets any OpenAI-compatible client (Cursor,
 * LibreChat, chat UIs, scripts) use Muse as its model backend. History is
 * managed by the server, like nanobot: each request carries one user message,
 * and the conversation lives in Muse with the full agent loop (tools, memory,
 * approvals) behind it.
 */

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

interface ChatCompletionsBody {
  model?: string
  messages: OpenAiMessage[]
  stream?: boolean
  temperature?: number
}

const DEFAULT_TITLE = 'OpenAI API client'

@Controller('v1')
@UseGuards(JwtAuthGuard)
export class OpenAiCompatController {
  constructor(
    private prisma: PrismaService,
    private agent: AgentService,
  ) {}

  /** Many OpenAI clients probe this first. */
  @ApiExcludeEndpoint()
  @Get('models')
  listModels() {
    const data = Object.entries(LLM_MODELS).flatMap(([provider, tiers]) => [
      { id: tiers.default, object: 'model', owned_by: provider },
    ])
    return { object: 'list', data }
  }

  @ApiExcludeEndpoint()
  @Post('chat/completions')
  async chatCompletions(
    @Req() req: any,
    @Body() body: ChatCompletionsBody,
    @Res({ passthrough: false }) res: Response,
  ) {
    const userId = req.user?.id ?? req.user?.sub
    const messages = Array.isArray(body?.messages) ? body.messages : []
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user')
    const prompt = String(lastUser?.content ?? '').trim()

    if (!prompt) {
      res.status(400).json({
        error: { message: 'At least one user message is required.', type: 'invalid_request_error', code: null },
      })
      return
    }

    const conversationId = await this.resolveConversation(
      userId,
      String(req.headers['x-conversation-id'] ?? '').trim(),
    )

    const model = String(body?.model ?? 'muse-agent')
    const completionId = `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const created = Math.floor(Date.now() / 1000)

    if (body?.stream) {
      res.status(200)
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders?.()

      const send = (payload: unknown) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`)
      }

      send({
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      })

      try {
        await this.agent.run({
          conversationId,
          userId,
          userMessage: prompt,
          emit: (event, data) => {
            if (event !== 'delta') return
            const content = (data as { content?: string })?.content
            if (!content) return
            send({
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [{ index: 0, delta: { content }, finish_reason: null }],
            })
          },
        })

        send({
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })
        res.write('data: [DONE]\n\n')
      } catch (error: any) {
        send({
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: { content: `\n[agent error] ${error?.message ?? error}` }, finish_reason: 'stop' }],
        })
        res.write('data: [DONE]\n\n')
      }
      res.end()
      return
    }

    // Non-streaming: run the agent, then return the final assistant message.
    try {
      await this.agent.run({
        conversationId,
        userId,
        userMessage: prompt,
        emit: () => undefined,
      })
    } catch (error: any) {
      res.status(500).json({
        error: { message: error?.message ?? 'Agent run failed.', type: 'server_error', code: null },
      })
      return
    }

    const reply = await this.prisma.message.findFirst({
      where: { conversationId, role: 'agent', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    })

    const content = reply?.content ?? ''
    res.status(200).json({
      id: completionId,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: Math.ceil(prompt.length / 4),
        completion_tokens: Math.ceil(content.length / 4),
        total_tokens: Math.ceil((prompt.length + content.length) / 4),
      },
    })
  }

  /** History lives in Muse: one stable conversation per client unless overridden. */
  private async resolveConversation(userId: string, requestedId: string): Promise<string> {
    if (requestedId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { id: requestedId, userId },
        select: { id: true },
      })
      if (existing) return existing.id
    }

    const existing = await this.prisma.conversation.findFirst({
      where: { userId, title: DEFAULT_TITLE },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    if (existing) return existing.id

    const created = await this.prisma.conversation.create({
      data: { userId, title: DEFAULT_TITLE },
    })
    return created.id
  }
}
