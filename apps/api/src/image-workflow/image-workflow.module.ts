import { Module } from '@nestjs/common'
import { ImageWorkflowController } from './image-workflow.controller'
import { ImageWorkflowService } from './image-workflow.service'

@Module({
  controllers: [ImageWorkflowController],
  providers: [ImageWorkflowService],
  exports: [ImageWorkflowService],
})
export class ImageWorkflowModule {}
