import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { SystemController } from './system.controller'
import { SystemService } from './system.service'

@Module({
  imports: [AgentModule],
  providers: [SystemService],
  controllers: [SystemController],
  exports: [SystemService],
})
export class SystemModule {}
