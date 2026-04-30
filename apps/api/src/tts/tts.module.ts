import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { TtsController } from './tts.controller'
import { TtsService } from './tts.service'

@Module({
  imports: [HttpModule],
  controllers: [TtsController],
  providers: [TtsService],
  exports: [TtsService],
})
export class TtsModule {}

