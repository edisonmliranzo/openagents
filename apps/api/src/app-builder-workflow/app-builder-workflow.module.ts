import { Module } from '@nestjs/common'
import { AppBuilderWorkflowController } from './app-builder-workflow.controller'
import { AppBuilderWorkflowService } from './app-builder-workflow.service'

@Module({
  controllers: [AppBuilderWorkflowController],
  providers: [AppBuilderWorkflowService],
  exports: [AppBuilderWorkflowService],
})
export class AppBuilderWorkflowModule {}
