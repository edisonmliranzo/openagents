import { Controller, Post, Body, Param } from '@nestjs/common'
import { WarRoomService } from './war-rooms.service'

@Controller('api/v1/war-rooms')
export class WarRoomsController {
  constructor(private readonly service: WarRoomService) {}

  @Post()
  create(@Body() body: { userId: string, name: string, agents: string[] }) {
    return this.service.createRoom(body.userId, body.name, body.agents)
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
