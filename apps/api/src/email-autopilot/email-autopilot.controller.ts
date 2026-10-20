import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { EmailAutopilotService, type RuleInput } from './email-autopilot.service'

const uid = (req: any): string => req.user?.id ?? req.user?.sub

@ApiTags('email-autopilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('email-autopilot')
export class EmailAutopilotController {
  constructor(private readonly service: EmailAutopilotService) {}

  @Get('triage')
  triage(@Req() req: any) {
    return this.service.getTriage(uid(req))
  }

  @Post('run')
  run(@Req() req: any) {
    return this.service.runNow(uid(req))
  }

  @Get('drafts')
  drafts(@Req() req: any, @Query('status') status?: string) {
    return this.service.listDrafts(uid(req), status)
  }

  @Patch('drafts/:id')
  editDraft(@Req() req: any, @Param('id') id: string, @Body() body: { body?: string; subject?: string; to?: string }) {
    return this.service.editDraft(uid(req), id, body ?? {})
  }

  @Post('drafts/:id/approve')
  approve(@Req() req: any, @Param('id') id: string) {
    return this.service.approveDraft(uid(req), id)
  }

  @Post('drafts/:id/reject')
  reject(@Req() req: any, @Param('id') id: string) {
    return this.service.rejectDraft(uid(req), id)
  }

  @Get('actions')
  actions(@Req() req: any) {
    return this.service.listPendingActions(uid(req))
  }

  @Post('actions/:id/approve')
  approveAction(@Req() req: any, @Param('id') id: string) {
    return this.service.resolveAction(uid(req), id, true)
  }

  @Post('actions/:id/reject')
  rejectAction(@Req() req: any, @Param('id') id: string) {
    return this.service.resolveAction(uid(req), id, false)
  }

  @Get('rules')
  rules(@Req() req: any) {
    return this.service.listRules(uid(req))
  }

  @Post('rules')
  createRule(@Req() req: any, @Body() body: RuleInput) {
    return this.service.createRule(uid(req), body ?? {})
  }

  @Patch('rules/:id')
  updateRule(@Req() req: any, @Param('id') id: string, @Body() body: RuleInput) {
    return this.service.updateRule(uid(req), id, body ?? {})
  }

  @Delete('rules/:id')
  deleteRule(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteRule(uid(req), id)
  }

  @Get('style')
  style(@Req() req: any) {
    return this.service.getStyle(uid(req))
  }

  @Post('style/learn')
  learnStyle(@Req() req: any) {
    return this.service.learnStyle(uid(req))
  }
}
