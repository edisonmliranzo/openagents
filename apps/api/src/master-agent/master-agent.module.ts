import { Module } from '@nestjs/common'
import { MasterAgentController } from './master-agent.controller'
import { MasterAgentService } from './master-agent.service'

@Module({
  controllers: [MasterAgentController],
  providers: [MasterAgentService],
  exports: [MasterAgentService],
})
export class MasterAgentModule {}
