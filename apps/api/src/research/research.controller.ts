import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ResearchService } from './research.service'

@Controller('research')
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  /** Fire-and-forget autonomous goal execution — agent picks its own tools and runs until done */
  @Post('goal')
  async executeGoal(
    @Body()
    body: {
      userId: string
      goal: string
      maxSteps?: number
      autonomyLevel?: 'safe' | 'advisory' | 'autonomous'
    },
  ) {
    return this.research.executeAutonomousGoal(body)
  }

  /** Policy-gated plan-and-act with optional single tool call */
  @Post('plan-and-act')
  async planAndAct(
    @Body()
    body: {
      userId: string
      query: string
      toolName?: string
      toolInput?: Record<string, unknown>
    },
  ) {
    return this.research.planAndAct(body)
  }

  // ── Chat endpoints ────────────────────────────────────────────────────────────

  @Post('chats')
  async createChat(@Body() body: { userId: string }) {
    return this.research.createNewChat(body.userId)
  }

  @Get('chats/:userId')
  async listChats(@Param('userId') userId: string) {
    return this.research.getUserChats(userId)
  }

  @Get('chats/:userId/:chatId')
  async getChat(@Param('userId') userId: string, @Param('chatId') chatId: string) {
    return this.research.getChatHistory(userId, chatId)
  }

  @Post('chats/:userId/:chatId/message')
  async sendMessage(
    @Param('userId') userId: string,
    @Param('chatId') chatId: string,
    @Body() body: { message: string },
  ) {
    return this.research.sendMessageToChat(userId, chatId, body.message)
  }

  @Delete('chats/:userId/:chatId')
  async archiveChat(@Param('userId') userId: string, @Param('chatId') chatId: string) {
    await this.research.archiveChat(userId, chatId)
    return { archived: true }
  }
}
