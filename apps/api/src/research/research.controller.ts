import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ResearchService } from './research.service'
import { DeepResearchService } from './deep-research.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('research')
export class ResearchController {
  constructor(
    private readonly research: ResearchService,
    private readonly deep: DeepResearchService,
  ) {}

  // ── Deep research with citations ─────────────────────────────────────────────

  /** Start a deep research job (runs in background; poll GET research/deep/:id) */
  @Post('deep')
  startDeep(
    @CurrentUserId() userId: string,
    @Body() body: { goal: string; maxQueries?: number; includeLibrary?: boolean },
  ) {
    return this.deep.start(userId, body)
  }

  @Get('deep')
  listDeep(@CurrentUserId() userId: string) {
    return this.deep.list(userId)
  }

  @Get('deep/:id')
  getDeep(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.deep.get(userId, id)
  }

  @Get('deep/:id/report')
  getDeepReport(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.deep.report(userId, id)
  }

  @Post('deep/:id/export')
  exportDeep(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: { title?: string; workspaceId?: string },
  ) {
    return this.deep.exportToArtifact(userId, id, body)
  }

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
  async createChat(@CurrentUserId() userId: string) {
    return this.research.createNewChat(userId)
  }

  @Get('chats/:userId')
  async listChats(@CurrentUserId() userId: string) {
    return this.research.getUserChats(userId)
  }

  @Get('chats/:userId/:chatId')
  async getChat(@CurrentUserId() userId: string, @Param('chatId') chatId: string) {
    return this.research.getChatHistory(userId, chatId)
  }

  @Post('chats/:userId/:chatId/message')
  async sendMessage(
    @CurrentUserId() userId: string,
    @Param('chatId') chatId: string,
    @Body() body: { message: string },
  ) {
    return this.research.sendMessageToChat(userId, chatId, body.message)
  }

  @Delete('chats/:userId/:chatId')
  async archiveChat(@CurrentUserId() userId: string, @Param('chatId') chatId: string) {
    await this.research.archiveChat(userId, chatId)
    return { archived: true }
  }
}
