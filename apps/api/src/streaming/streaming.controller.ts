import { Controller, Get, Param, Query } from '@nestjs/common'
import { StreamingService } from './streaming.service'

@Controller('api/v1/streaming')
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
