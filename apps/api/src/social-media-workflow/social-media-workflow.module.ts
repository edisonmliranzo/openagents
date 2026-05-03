import { Module } from '@nestjs/common'
import { SocialMediaWorkflowController } from './social-media-workflow.controller'
import { SocialMediaWorkflowService } from './social-media-workflow.service'

@Module({
  controllers: [SocialMediaWorkflowController],
  providers: [SocialMediaWorkflowService],
  exports: [SocialMediaWorkflowService],
})
export class SocialMediaWorkflowModule {}
