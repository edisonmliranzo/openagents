import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { ToolsModule } from '../tools/tools.module'
import { DurableController } from './durable.controller'
import { DurableService } from './durable.service'

@Module({
  imports: [AgentModule, ToolsModule],
  controllers: [DurableController],
  providers: [DurableService],
  exports: [DurableService],
})
export class DurableModule {}
