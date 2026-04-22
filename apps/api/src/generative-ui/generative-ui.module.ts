import { Module } from '@nestjs/common'
import { GenerativeUIService } from './generative-ui.service'
import { GenerativeUIController } from './generative-ui.controller'

@Module({
  providers: [GenerativeUIService],
  controllers: [GenerativeUIController],
  exports: [GenerativeUIService],
})
export class GenerativeUIModule {}
