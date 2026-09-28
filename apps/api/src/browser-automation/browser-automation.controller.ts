import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt.guard'
import { BrowserAutomationService } from './browser-automation.service'

@ApiTags('browser')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('browser')
export class BrowserAutomationController {
  constructor(private readonly service: BrowserAutomationService) {}

  @Get('sessions')
  list(@Req() req: any) {
    return this.service.listSessions(req.user.id)
  }

  @Post('sessions')
  start(@Req() req: any, @Body('url') url: string) {
    return this.service.startSession(url, req.user.id)
  }

  @Post('sessions/:id/action')
  execute(@Param('id') id: string, @Body() body: any) {
    return this.service.executeAction(id, body)
  }

  @Get('sessions/:id/state')
  state(@Param('id') id: string) {
    return this.service.captureState(id)
  }

  @Delete('sessions/:id')
  close(@Param('id') id: string) {
    return this.service.closeSession(id)
  }
}
