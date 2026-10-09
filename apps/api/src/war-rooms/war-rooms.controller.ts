import { Controller, Post, Body, Param } from '@nestjs/common'
import { WarRoomService } from './war-rooms.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('war-rooms')
export class WarRoomsController {
  constructor(private readonly service: WarRoomService) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: { name: string, agents: string[] }) {
    return this.service.createRoom(userId, body.name, body.agents)
  }

  @Post(':id/messages')
  message(@Param('id') id: string, @Body() body: { agentName: string, content: string }) {
    return this.service.broadcastMessage(id, body.agentName, body.content)
  }

  @Post(':id/conclude')
  conclude(@Param('id') id: string) {
    return this.service.concludeRoom(id)
  }
}
