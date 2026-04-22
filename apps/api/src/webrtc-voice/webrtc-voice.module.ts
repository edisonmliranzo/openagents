import { Module } from '@nestjs/common'
import { WebRTCVoiceService } from './webrtc-voice.service'
import { WebRTCVoiceController } from './webrtc-voice.controller'

@Module({
  providers: [WebRTCVoiceService],
  controllers: [WebRTCVoiceController],
  exports: [WebRTCVoiceService],
})
export class WebRTCVoiceModule {}
