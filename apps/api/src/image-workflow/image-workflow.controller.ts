import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CreateImageWorkflowDto } from './image-workflow.dto'
import { ImageWorkflowService } from './image-workflow.service'

@ApiTags('image-workflow')
@Controller('image-workflow')
export class ImageWorkflowController {
  constructor(private readonly imageWorkflow: ImageWorkflowService) {}

  @Post('plan')
  createPlan(@Body() dto: CreateImageWorkflowDto) {
    return this.imageWorkflow.createPlan(dto)
  }

  @Get('prompt')
  getPrompt() {
    return this.imageWorkflow.getSystemPrompt()
  }

  @Get('capabilities')
  getCapabilities() {
    return this.imageWorkflow.getCapabilities()
  }
}
