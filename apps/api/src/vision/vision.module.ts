import { Module } from '@nestjs/common'
import { VisionController } from './vision.controller'
import { VisionService } from './vision.service'
import { AgentModule } from '../agent/agent.module'
import { UsersModule } from '../users/users.module'

@Module({
  imports: [AgentModule, UsersModule],
  controllers: [VisionController],
  providers: [VisionService],
  exports: [VisionService],
})
export class VisionModule {}
