import { Module } from '@nestjs/common'
import { VideoWorkflowController } from './video-workflow.controller'
import { VideoWorkflowService } from './video-workflow.service'

@Module({
  controllers: [VideoWorkflowController],
  providers: [VideoWorkflowService],
  exports: [VideoWorkflowService],
})
export class VideoWorkflowModule {}
