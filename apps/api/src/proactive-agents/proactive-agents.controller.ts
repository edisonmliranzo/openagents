import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { ProactiveAgentService, type ProactiveTriggerDto } from './proactive-agents.service'
import { MomentsService } from './moments.service'
import type { MomentSettings } from './moments.store'

@ApiTags('proactive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('proactive')
export class ProactiveAgentsController {
  constructor(
    private readonly service: ProactiveAgentService,
    private readonly moments: MomentsService,
  ) {}

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

  @Get('moments')
  listMoments(@Req() req: any, @Query('status') status?: string) {
    return this.moments.list(req.user.id, status)
  }

  @Post('moments/scan')
  scanMoments(@Req() req: any) {
    return this.moments.runForUser(req.user.id)
  }

  @Get('moments/settings')
  getMomentsSettings(@Req() req: any) {
    return this.moments.getSettings(req.user.id)
  }

  @Put('moments/settings')
  updateMomentsSettings(@Req() req: any, @Body() body: Partial<MomentSettings>) {
    return this.moments.updateSettings(req.user.id, body ?? {})
  }

  @Post('moments/:id/snooze')
  snoozeMoment(@Req() req: any, @Param('id') id: string, @Body() body?: { minutes?: number }) {
    return this.moments.snooze(req.user.id, id, body?.minutes)
  }

  @Post('moments/:id/dismiss')
  dismissMoment(@Req() req: any, @Param('id') id: string) {
    return this.moments.dismiss(req.user.id, id)
  }

  @Post('moments/:id/act')
  actMoment(@Req() req: any, @Param('id') id: string, @Body() body?: { actionId?: string }) {
    return this.moments.act(req.user.id, id, body?.actionId)
  }
}
