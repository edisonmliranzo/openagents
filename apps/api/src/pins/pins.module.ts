import { Module } from '@nestjs/common'
import { PinService } from './pin.service'
import { PinController } from './pin.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [PinService],
  controllers: [PinController],
  exports: [PinService],
})
export class PinsModule {}
