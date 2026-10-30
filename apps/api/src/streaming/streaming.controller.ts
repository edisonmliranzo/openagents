import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { StreamingService } from './streaming.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner')
@Controller('streaming')
export class StreamingController {
  constructor(private streaming: StreamingService) {}

  @Get('sessions')
  listSessions(@Query('conversationId') conversationId?: string) {
    return this.streaming.listActiveSessions(conversationId)
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.streaming.getSession(id) ?? { error: 'Session not found' }
  }

  @Get('sessions/:id/content')
  getContent(@Param('id') id: string) {
    return { content: this.streaming.getFullContent(id) }
  }
}
