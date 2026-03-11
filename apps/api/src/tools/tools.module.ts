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
import { BybitTool } from './connectors/bybit.tool'
import { DeepResearchTool } from './connectors/deep-research.tool'
import { ComputerUseTool } from './connectors/computer-use.tool'
import { CronModule } from '../cron/cron.module'
import { ConnectorsModule } from '../connectors/connectors.module'
import { McpService } from './mcp.service'
import { PromptGuardService } from './prompt-guard.service'
import { OutboundGuardService } from './outbound-guard.service'

@Module({
  imports: [CronModule, ConnectorsModule],
  providers: [
    ToolsService,
    GmailTool,
    CalendarTool,
    WebFetchTool,
    NotesTool,
    WebSearchTool,
    TimeTool,
    CronTool,
    BybitTool,
    DeepResearchTool,
    ComputerUseTool,
    McpService,
    PromptGuardService,
    OutboundGuardService,
  ],
  controllers: [ToolsController],
  exports: [ToolsService, PromptGuardService, OutboundGuardService],
})
export class ToolsModule {}
