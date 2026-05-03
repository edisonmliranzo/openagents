import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CreateSocialMediaWorkflowDto } from './social-media-workflow.dto'
import { SocialMediaWorkflowService } from './social-media-workflow.service'

@ApiTags('social-media-workflow')
@Controller('social-media-workflow')
export class SocialMediaWorkflowController {
  constructor(private readonly socialMedia: SocialMediaWorkflowService) {}

  @Post('plan')
  createPlan(@Body() dto: CreateSocialMediaWorkflowDto) {
    return this.socialMedia.createPlan(dto)
  }

  @Get('prompt')
  getPrompt() {
    return this.socialMedia.getSystemPrompt()
  }

  @Get('capabilities')
  getCapabilities() {
    return this.socialMedia.getCapabilities()
  }
}
