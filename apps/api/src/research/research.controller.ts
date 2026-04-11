import { Body, Controller, Post } from '@nestjs/common'
import { ResearchService } from './research.service'

@Controller('research')
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Post('plan-and-act')
  async planAndAct(
    @Body()
    body: {
      userId: string
      query: string
      toolName?: string
      toolInput?: Record<string, unknown>
    },
  ) {
    return this.research.planAndAct(body)
  }
}
