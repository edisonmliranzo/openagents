import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CreateUGCAdWorkflowDto } from './ugc-ad-workflow.dto'
import { UGCAdWorkflowService } from './ugc-ad-workflow.service'

@ApiTags('ugc-ad-workflow')
@Controller('ugc-ad-workflow')
export class UGCAdWorkflowController {
  constructor(private readonly ugcAd: UGCAdWorkflowService) {}

  @Post('plan')
  createPlan(@Body() dto: CreateUGCAdWorkflowDto) {
    return this.ugcAd.createPlan(dto)
  }

  @Get('prompt')
  getPrompt() {
    return this.ugcAd.getSystemPrompt()
  }

  @Get('capabilities')
  getCapabilities() {
    return this.ugcAd.getCapabilities()
  }
}
