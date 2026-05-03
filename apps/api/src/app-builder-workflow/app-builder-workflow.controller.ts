import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CreateAppBuilderWorkflowDto } from './app-builder-workflow.dto'
import { AppBuilderWorkflowService } from './app-builder-workflow.service'

@ApiTags('app-builder-workflow')
@Controller('app-builder-workflow')
export class AppBuilderWorkflowController {
  constructor(private readonly appBuilder: AppBuilderWorkflowService) {}

  @Post('plan')
  createPlan(@Body() dto: CreateAppBuilderWorkflowDto) {
    return this.appBuilder.createPlan(dto)
  }

  @Get('prompt')
  getPrompt() {
    return this.appBuilder.getSystemPrompt()
  }

  @Get('capabilities')
  getCapabilities() {
    return this.appBuilder.getCapabilities()
  }
}
