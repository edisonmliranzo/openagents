import {
  Controller, Get, Post, Delete, Param, Body, UseGuards, Req, Res,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { Response } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ConversationsService } from './conversations.service'
import { AgentService } from '../agent/agent.service'
import { NanobotLoopService } from '../nanobot/agent/nanobot-loop.service'
import { NanobotConfigService } from '../nanobot/config/nanobot-config.service'
import { HandoffsService } from '../handoffs/handoffs.service'

class CreateConversationDto {
  @IsString() @IsOptional() title?: string
}

class ChatDto {
  @IsString() content: string
}

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private conversations: ConversationsService,
    private agent: AgentService,
    private nanobotLoop: NanobotLoopService,
    private nanobotConfig: NanobotConfigService,
    private handoffs: HandoffsService,
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

  @Post(':id/chat')
  async chat(
    @Param('id') conversationId: string,
    @Body() dto: ChatDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const emit = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      const activeHandoff = await this.handoffs.getActiveForConversation(req.user.id, conversationId)
      if (activeHandoff) {
        throw new Error(
          `Conversation is in human handoff mode (${activeHandoff.status}). Return handoff to agent before continuing.`,
        )
      }

      const isSkillCommand = /^\s*(\/skill\s+|learn\s+skill\s*:|teach\s+skill\s*:|learn\s+skills?\s+(?:of|about|for)\s+)/i
        .test(dto.content ?? '')
      const useNanobotLoop = this.nanobotConfig.enabled || isSkillCommand
      const run = useNanobotLoop
        ? this.nanobotLoop.run.bind(this.nanobotLoop)
        : this.agent.run.bind(this.agent)
      await run({
        conversationId,
        userId: req.user.id,
        userMessage: dto.content,
        emit,
      })
    } catch (err: any) {
      emit('error', { message: err.message })
    } finally {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.conversations.delete(id, req.user.id)
  }
}
