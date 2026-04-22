import { Module } from '@nestjs/common'
import { PinService } from './pin.service'
import { PinController } from './pin.controller'

@Module({
  providers: [PinService],
  controllers: [PinController],
  exports: [PinService],
})
export class PinsModule {}
