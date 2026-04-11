import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { ToolsModule } from '../tools/tools.module'
import { WorkflowsController } from './workflows.controller'
import { WorkflowsInternalController } from './workflows.internal.controller'
import { WorkflowsService } from './workflows.service'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [AgentModule, ToolsModule, EventsModule],
  controllers: [WorkflowsController, WorkflowsInternalController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
