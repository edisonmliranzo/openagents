import { Module } from '@nestjs/common'
import { HooksService } from './hooks.service'
import { HooksController } from './hooks.controller'

@Module({
  providers: [HooksService],
  controllers: [HooksController],
  exports: [HooksService],
})
export class HooksModule {}
