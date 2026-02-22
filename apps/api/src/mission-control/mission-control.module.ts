import { Global, Module } from '@nestjs/common'
import { MissionControlController } from './mission-control.controller'
import { MissionControlService } from './mission-control.service'

@Global()
@Module({
  controllers: [MissionControlController],
  providers: [MissionControlService],
  exports: [MissionControlService],
})
export class MissionControlModule {}
