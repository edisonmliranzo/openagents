import {
  Controller, Get, Post, Delete, Param, Body, UseGuards, Req, Res, Query,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { Response } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ConversationsService } from './conversations.service'
import { AgentService } from '../agent/agent.service'
import { ContextCompressorService } from '../agent/context-compressor.service'
import { NanobotLoopService } from '../nanobot/agent/nanobot-loop.service'
import { NanobotConfigService } from '../nanobot/config/nanobot-config.service'
import { WsGateway } from '../events/ws.gateway'
import { StreamingService } from '../streaming/streaming.service'

const SKILL_COMMAND_PATTERN = /^\s*(\/skill\s+|learn\s+skill\s*:|teach\s+skill\s*:|learn\s+skills?\s+(?:of|about|for)\s+)/i
const ADAPTIVE_SKILL_INTENT_PATTERN =
  /\b(deep research|research|investigate|analy[sz]e|trade|trading|crypto|bitcoin|forex|stock|stocks|futures|options|video script|video scripts|content ideas?|social media|tiktok|instagram|youtube|reels?|shorts|amazon|ebay|product research|products?\s+to\s+sell|dropship|shopify)\b/i

class CreateConversationDto {
  @IsString() @IsOptional() title?: string
}

class ChatDto {
  @IsString() content: string
  @IsString() @IsOptional() mode?: string
}

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private conversations: ConversationsService,
    private agent: AgentService,
    private compressor: ContextCompressorService,
    private nanobotLoop: NanobotLoopService,
    private nanobotConfig: NanobotConfigService,
    private wsGateway: WsGateway,
    private streamingService: StreamingService,
  ) {}

  @Get()
  list(@Req() req: any) {
    return this.conversations.list(req.user.id)
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: any) {
    return this.conversations.get(id, req.user.id)
  }

  @Post()
  create(@Body() dto: CreateConversationDto, @Req() req: any) {
    return this.conversations.create(req.user.id, dto.title)
  }

  @Get(':id/messages')
  messages(@Param('id') id: string, @Req() req: any) {
    return this.conversations.messages(id, req.user.id)
  }

  @Get(':id/repair')
  inspectRepair(@Param('id') id: string, @Req() req: any) {
    return this.conversations.inspectRepair(id, req.user.id)
  }

  @Post(':id/chat')
  async chat(
    @Param('id') conversationId: string,
    @Body() dto: ChatDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')  // Tells nginx to never buffer this response
    res.setHeader('Transfer-Encoding', 'chunked')
    res.flushHeaders()

    const streamSession = this.streamingService.createSession(conversationId)

    const emit = (event: string, data: unknown) => {
      // 1. Log chunk and tool progress in StreamingService
      if (event === 'message' || event === 'tokens' || event === 'thinking') {
        const textContent = typeof data === 'string'
          ? data
          : (data as any)?.content ?? (data as any)?.message ?? JSON.stringify(data)
        this.streamingService.pushChunk(streamSession.id, {
          type: event === 'tokens' ? 'token' : 'text',
          content: textContent,
        })
      } else if (event === 'tool_result' || event === 'status' || event === 'approval_required') {
        const toolName = (data as any)?.tool ?? (data as any)?.toolName ?? 'unknown'
        const status = event === 'status'
          ? ((data as any)?.status ?? 'running')
          : event === 'approval_required'
            ? 'failed'
            : 'completed'
        const msg = typeof data === 'string' ? data : JSON.stringify(data)
        this.streamingService.pushToolProgress(streamSession.id, {
          toolName,
          status,
          message: msg,
        })
      }

      // 2. Stream over SSE
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      if (typeof (res as any).flush === 'function') (res as any).flush()

      // 3. Broadcast to WebSocket conversation room
      this.wsGateway.emitToConversation(conversationId, event, data)
    }

    try {
      const message = dto.content ?? ''
      const isSkillCommand = SKILL_COMMAND_PATTERN.test(message)
      const isAdaptiveSkillIntent =
        this.nanobotConfig.adaptiveIntentRoutingEnabled && ADAPTIVE_SKILL_INTENT_PATTERN.test(message)
      const useNanobotLoop = isSkillCommand || isAdaptiveSkillIntent
      const run = useNanobotLoop
        ? this.nanobotLoop.run.bind(this.nanobotLoop)
        : this.agent.run.bind(this.agent)
      await run({
        conversationId,
        userId: req.user.id,
        userMessage: dto.content,
        emit,
        ...(dto.mode ? { systemPromptAppendix: `User-selected mode: ${dto.mode}\nApply this mode's execution rules.` } : {}),
      })
    } catch (err: any) {
      emit('error', { message: err.message })
    } finally {
      this.streamingService.completeSession(streamSession.id)
      res.write('data: [DONE]\n\n')
      res.end()
    }
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.conversations.delete(id, req.user.id)
  }

  @Post(':id/repair')
  repair(@Param('id') id: string, @Req() req: any) {
    return this.conversations.repairState(id, req.user.id)
  }

  @Post(':id/compress')
  async compress(@Param('id') id: string, @Req() req: any) {
    const summary = await this.compressor.forceCompress(id, req.user.id)
    return { ok: true, summary }
  }

  @Get('search')
  search(@Query('q') q: string, @Req() req: any) {
    return this.conversations.search(req.user.id, q ?? '')
  }

  @Get(':id/export/jsonl')
  async exportJsonl(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const lines = await this.conversations.exportJsonl(id, req.user.id)
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Content-Disposition', `attachment; filename="conversation-${id}.jsonl"`)
    res.send(lines.join('\n'))
  }
}
