import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ProactiveAgentService, type ProactiveTriggerDto } from './proactive-agents.service'

@ApiTags('proactive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('proactive')
export class ProactiveAgentsController {
  constructor(private readonly service: ProactiveAgentService) {}

  @Post('triggers')
  create(@Req() req: any, @Body() body: ProactiveTriggerDto) {
    return this.service.registerTrigger(req.user.id, body)
  }

  @Get('triggers')
  list(@Req() req: any) {
    return this.service.listTriggers(req.user.id)
  }

  @Patch('triggers/:id/enable')
  enable(@Req() req: any, @Param('id') id: string) {
    return this.service.setTriggerEnabled(req.user.id, id, true)
  }

  @Patch('triggers/:id/disable')
  disable(@Req() req: any, @Param('id') id: string) {
    return this.service.setTriggerEnabled(req.user.id, id, false)
  }

  @Delete('triggers/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteTrigger(req.user.id, id)
  }

  @Get('logs')
  logs(@Req() req: any, @Query('limit') limit?: string) {
    return this.service.listLogs(req.user.id, limit ? Number(limit) : 20)
  }
}
