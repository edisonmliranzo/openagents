import { Controller, Post, Body, Param } from '@nestjs/common'
import { LocalDaemonService } from './local-daemon.service'

@Controller('api/v1/daemon')
export class LocalDaemonController {
  constructor(private readonly service: LocalDaemonService) {}

  @Post('register')
  register(@Body() body: { userId: string, hostname: string, capabilities: string[] }) {
    return this.service.registerDaemon(body.userId, body.hostname, body.capabilities)
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
