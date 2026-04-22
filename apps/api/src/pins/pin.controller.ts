import { Controller, Post, Delete, Get, Param, Body, Query } from '@nestjs/common'
import { PinService } from './pin.service'

@Controller('api/v1/pins')
export class PinController {
  constructor(private pins: PinService) {}

  @Post()
  pin(@Body() body: any) { return this.pins.pin(body) }

  @Delete(':id')
  unpin(@Param('id') id: string) { return this.pins.unpin(id) }

  @Get('conversation/:conversationId')
  listForConversation(@Param('conversationId') cid: string) {
    return this.pins.listForConversation(cid)
  }

  @Get('user/:userId')
  listForUser(@Param('userId') uid: string, @Query('limit') limit?: string) {
    return this.pins.listForUser(uid, limit ? parseInt(limit, 10) : undefined)
  }
}
