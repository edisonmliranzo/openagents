import { Module } from '@nestjs/common'
import { ToolsService } from './tools.service'
import { ToolsController } from './tools.controller'
import { GmailTool } from './connectors/gmail.tool'
import { CalendarTool } from './connectors/calendar.tool'
import { WebFetchTool } from './connectors/web-fetch.tool'
import { NotesTool } from './connectors/notes.tool'

@Module({
  providers: [ToolsService, GmailTool, CalendarTool, WebFetchTool, NotesTool],
  controllers: [ToolsController],
  exports: [ToolsService],
})
export class ToolsModule {}
