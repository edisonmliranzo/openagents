import { Controller, Post, Delete, Get, Param, Body, Query } from '@nestjs/common'
import { PinService } from './pin.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('pins')
export class PinController {
  constructor(private pins: PinService) {}

  @Post()
  pin(
    @CurrentUserId() userId: string,
    @Body() body: { messageId: string; conversationId: string; note?: string },
  ) {
    // The user always comes from the token — never from the request body.
    return this.pins.pin({ ...body, userId })
  }

  @Delete(':id')
  unpin(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.pins.unpin(id, userId)
  }

  @Get('conversation/:conversationId')
  listForConversation(@CurrentUserId() userId: string, @Param('conversationId') cid: string) {
    return this.pins.listForConversation(cid, userId)
  }

  @Get('user')
  listForUser(@CurrentUserId() userId: string, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '50', 10)
    return this.pins.listForUser(userId, Number.isFinite(parsed) ? parsed : 50)
  }

  /** Legacy path kept for compatibility — always scoped to the caller. */
  @Get('user/:userId')
  listForUserLegacy(@CurrentUserId() userId: string, @Param('userId') _requested: string, @Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '50', 10)
    return this.pins.listForUser(userId, Number.isFinite(parsed) ? parsed : 50)
  }
}
