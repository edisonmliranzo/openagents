import { Module } from '@nestjs/common'
import { ProactiveAgentService } from './proactive-agents.service'
import { ProactiveAgentsController } from './proactive-agents.controller'

@Module({
  providers: [ProactiveAgentService],
  controllers: [ProactiveAgentsController],
  exports: [ProactiveAgentService],
})
export class ProactiveAgentsModule {}
