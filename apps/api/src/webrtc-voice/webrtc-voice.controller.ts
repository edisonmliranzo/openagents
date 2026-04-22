import { Controller, Post, Body, Param, Delete } from '@nestjs/common'
import { WebRTCVoiceService } from './webrtc-voice.service'

@Controller('api/v1/voice/webrtc')
export class WebRTCVoiceController {
  constructor(private readonly service: WebRTCVoiceService) {}

  @Post('sessions')
  create(@Body() body: { userId: string, conversationId: string }) { 
    return this.service.createSession(body.userId, body.conversationId) 
  }

  @Post('sessions/:id/answer')
  answer(@Param('id') id: string, @Body('sdp') sdp: string) { 
    return this.service.processAnswer(id, sdp) 
  }

  @Delete('sessions/:id')
  end(@Param('id') id: string) { 
    return this.service.endSession(id) 
  }
}
