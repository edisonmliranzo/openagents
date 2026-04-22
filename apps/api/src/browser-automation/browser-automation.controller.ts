import { Controller, Post, Get, Param, Body, Delete } from '@nestjs/common'
import { BrowserAutomationService } from './browser-automation.service'

@Controller('api/v1/browser')
export class BrowserAutomationController {
  constructor(private readonly service: BrowserAutomationService) {}

  @Post('sessions')
  start(@Body('url') url: string) { return this.service.startSession(url) }

  @Post('sessions/:id/action')
  execute(@Param('id') id: string, @Body() body: any) { return this.service.executeAction(id, body) }

  @Get('sessions/:id/state')
  state(@Param('id') id: string) { return this.service.captureState(id) }

  @Delete('sessions/:id')
  close(@Param('id') id: string) { return this.service.closeSession(id) }
}
