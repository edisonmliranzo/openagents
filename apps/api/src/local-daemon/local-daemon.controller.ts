import { Controller, Post, Body, Param } from '@nestjs/common'
import { LocalDaemonService } from './local-daemon.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'
@Controller('daemon')
export class LocalDaemonController {
  constructor(private readonly service: LocalDaemonService) {}

  @Post('register')
  register(@CurrentUserId() userId: string, @Body() body: { hostname: string, capabilities: string[] }) {
    return this.service.registerDaemon(userId, body.hostname, body.capabilities)
  }

  @Post(':id/execute')
  execute(@Param('id') id: string, @Body('command') command: string) {
    return this.service.executeLocalCommand(id, command)
  }

  @Post(':id/ping')
  ping(@Param('id') id: string) {
    return this.service.ping(id)
  }
}
