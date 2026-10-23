import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ContentPipelineService, type PipelineConfig } from './content-pipeline.service'

@ApiTags('content-pipeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('content-pipeline')
export class ContentPipelineController {
  constructor(private readonly pipeline: ContentPipelineService) {}

  @Get()
  getConfig(@Req() req: any) {
    return this.pipeline.getConfig(req.user.id)
  }

  @Put()
  configure(@Req() req: any, @Body() body: Partial<PipelineConfig>) {
    return this.pipeline.configure(req.user.id, body)
  }

  @Post('run')
  run(@Req() req: any, @Body() body: { dryRun?: boolean }) {
    return this.pipeline.run(req.user.id, { dryRun: body?.dryRun === true })
  }
}
