import { Module } from '@nestjs/common'
import { UGCAdWorkflowController } from './ugc-ad-workflow.controller'
import { UGCAdWorkflowService } from './ugc-ad-workflow.service'

@Module({
  controllers: [UGCAdWorkflowController],
  providers: [UGCAdWorkflowService],
  exports: [UGCAdWorkflowService],
})
export class UGCAdWorkflowModule {}
