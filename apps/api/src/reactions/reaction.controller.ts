import { Controller, Post, Delete, Get, Param, Body, Query } from '@nestjs/common'
import { ReactionService } from './reaction.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'

@Controller('reactions')
export class ReactionController {
  constructor(private reactions: ReactionService) {}

  @Post()
  add(
    @CurrentUserId() userId: string,
    @Body() body: { messageId: string; conversationId: string; emoji: string },
  ) {
    // The user always comes from the token — never from the request body.
    return this.reactions.add({ ...body, userId })
  }

  /** Adds or removes the reaction and returns the new counts. */
  @Post('toggle')
  toggle(
    @CurrentUserId() userId: string,
    @Body() body: { messageId: string; conversationId: string; emoji: string },
  ) {
    return this.reactions.toggle({ ...body, userId })
  }

  @Delete(':id')
  remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.reactions.remove(id, userId)
  }

  @Get('message/:messageId')
  listForMessage(@Param('messageId') mid: string) {
    return this.reactions.listForMessage(mid)
  }

  @Get('message/:messageId/counts')
  async counts(@CurrentUserId() userId: string, @Param('messageId') mid: string) {
    const [counts, mine] = await Promise.all([
      this.reactions.getReactionCounts(mid),
      this.reactions.getUserReactions(userId, mid),
    ])
    return { counts, mine }
  }

  @Get('allowed')
  allowed() { return this.reactions.getAllowedReactions() }
}
