import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { WorkflowsModule } from '../workflows/workflows.module'
import { PlaybooksController } from './playbooks.controller'
import { PlaybooksService } from './playbooks.service'

@Module({
  imports: [AgentModule, WorkflowsModule],
  controllers: [PlaybooksController],
  providers: [PlaybooksService],
  exports: [PlaybooksService],
})
export class PlaybooksModule {}
