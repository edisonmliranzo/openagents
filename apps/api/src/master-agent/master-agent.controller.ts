import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { DetectIntentDto, RouteRequestDto } from './master-agent.dto'
import { MasterAgentService } from './master-agent.service'

@ApiTags('master-agent')
@Controller('master-agent')
export class MasterAgentController {
  constructor(private readonly masterAgent: MasterAgentService) {}

  @Post('route')
  route(@Body() dto: RouteRequestDto) {
    return this.masterAgent.route(dto)
  }

  @Post('detect')
  detectIntent(@Body() dto: DetectIntentDto) {
    return this.masterAgent.detectIntent(dto)
  }

  @Get('prompt')
  getPrompt() {
    return this.masterAgent.getSystemPrompt()
  }

  @Get('intents')
  getIntents() {
    return this.masterAgent.getIntents()
  }

  @Get('workflows')
  getWorkflows() {
    return this.masterAgent.getWorkflows()
  }
}
