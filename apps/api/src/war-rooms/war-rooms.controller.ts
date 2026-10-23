import { Controller, Post, Get, Body, Param, Delete, NotFoundException } from '@nestjs/common'
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
    const room = await this.service.getRoom(userId, id)
    if (!room) throw new NotFoundException('War room not found')
    return room
  }

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body() body: { name: string; agents?: string[]; topic?: string },
  ) {
    return this.service.createRoom(userId, body.name, body.agents ?? [], body.topic)
  }

  /** Runs a real multi-model debate in the room and scores the consensus. */
  @Post(':id/run')
  run(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: { question?: string; models?: string[] },
  ) {
    return this.service.runDebate(userId, id, body.question ?? '', body.models)
  }

  @Post(':id/messages')
  message(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: { agentName: string; content: string; role?: 'agent' | 'user' | 'system' },
  ) {
    return this.service.broadcastMessage(userId, id, body.agentName, body.content, body.role)
  }

  @Post(':id/conclude')
  conclude(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.concludeRoom(userId, id)
  }

  @Delete(':id')
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    const ok = await this.service.deleteRoom(userId, id)
    if (!ok) throw new NotFoundException('War room not found')
    return { ok: true }
  }
}
