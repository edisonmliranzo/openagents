import { Module, forwardRef } from '@nestjs/common'
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
import { GithubTool } from './connectors/github.tool'
import { NotionTool } from './connectors/notion.tool'
import { LinearTool } from './connectors/linear.tool'
import { JiraTool } from './connectors/jira.tool'
import { NewsTool } from './connectors/news.tool'
import { YoutubeTool } from './connectors/youtube.tool'
import { MemoryPersonalTool } from './connectors/memory-personal.tool'
import { ProactiveTool } from './connectors/proactive.tool'
import { ShellTool } from './connectors/shell.tool'
import { CodeExecutionTool } from './connectors/code-execution.tool'
import { ImageGenerationTool } from './connectors/image-generation.tool'
import { AudioGenerationTool } from './connectors/audio-generation.tool'
import { AtlasCloudTool } from './connectors/atlascloud.tool'
import { CronModule } from '../cron/cron.module'
import { ConnectorsModule } from '../connectors/connectors.module'
import { MemoryModule } from '../memory/memory.module'
import { McpService } from './mcp.service'
import { PromptGuardService } from './prompt-guard.service'
import { OutboundGuardService } from './outbound-guard.service'
import { PolicyModule } from '../policy/policy.module'
import { ToolsInternalController } from './tools.internal.controller'

@Module({
  imports: [forwardRef(() => CronModule), ConnectorsModule, PolicyModule, MemoryModule],
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
    GithubTool,
    NotionTool,
    LinearTool,
    JiraTool,
    NewsTool,
    YoutubeTool,
    MemoryPersonalTool,
    ProactiveTool,
    ShellTool,
    CodeExecutionTool,
    ImageGenerationTool,
    AudioGenerationTool,
    AtlasCloudTool,
    McpService,
    PromptGuardService,
    OutboundGuardService,
  ],
  controllers: [ToolsController, ToolsInternalController],
  exports: [ToolsService, PromptGuardService, OutboundGuardService],
})
export class ToolsModule {}
