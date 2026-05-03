import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CreateVideoWorkflowDto } from './video-workflow.dto'
import { VideoWorkflowService } from './video-workflow.service'

@ApiTags('video-workflow')
@Controller('video-workflow')
export class VideoWorkflowController {
  constructor(private readonly videoWorkflow: VideoWorkflowService) {}

  @Post('plan')
  createPlan(@Body() dto: CreateVideoWorkflowDto) {
    return this.videoWorkflow.createPlan(dto)
  }

  @Get('prompt')
  getPrompt() {
    return this.videoWorkflow.getSystemPrompt()
  }

  @Get('capabilities')
  getCapabilities() {
    return this.videoWorkflow.getCapabilities()
  }
}
