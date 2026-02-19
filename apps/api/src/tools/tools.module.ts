import { Module } from '@nestjs/common'
import { ToolsService } from './tools.service'
import { ToolsController } from './tools.controller'
import { GmailTool } from './connectors/gmail.tool'
import { CalendarTool } from './connectors/calendar.tool'
import { WebFetchTool } from './connectors/web-fetch.tool'
import { NotesTool } from './connectors/notes.tool'
import { WebSearchTool } from './connectors/web-search.tool'
import { TimeTool } from './connectors/time.tool'
import { CronTool } from './connectors/cron.tool'
import { CronModule } from '../cron/cron.module'

@Module({
  imports: [CronModule],
  providers: [ToolsService, GmailTool, CalendarTool, WebFetchTool, NotesTool, WebSearchTool, TimeTool, CronTool],
  controllers: [ToolsController],
  exports: [ToolsService],
})
export class ToolsModule {}
