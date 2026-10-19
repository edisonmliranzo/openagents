import { Controller, Post, Get, Body, Param, NotFoundException } from '@nestjs/common'
import { WarRoomService } from './war-rooms.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('war-rooms')
export class WarRoomsController {
  constructor(private readonly service: WarRoomService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.service.listRooms(userId)
  }

  @Get(':id')
  async get(@CurrentUserId() userId: string, @Param('id') id: string) {
    const room = await this.service.getRoom(id)
    if (!room || room.userId !== userId) throw new NotFoundException('War room not found')
    return room
  }

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
