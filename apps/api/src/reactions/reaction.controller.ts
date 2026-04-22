import { Controller, Post, Delete, Get, Param, Body } from '@nestjs/common'
import { ReactionService } from './reaction.service'

@Controller('api/v1/reactions')
export class ReactionController {
  constructor(private reactions: ReactionService) {}

  @Post()
  add(@Body() body: any) { return this.reactions.add(body) }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.reactions.remove(id) }

  @Get('message/:messageId')
  listForMessage(@Param('messageId') mid: string) { return this.reactions.listForMessage(mid) }

  @Get('message/:messageId/counts')
  counts(@Param('messageId') mid: string) { return this.reactions.getReactionCounts(mid) }

  @Get('allowed')
  allowed() { return this.reactions.getAllowedReactions() }
}
