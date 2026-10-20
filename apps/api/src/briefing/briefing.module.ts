import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { GoalsModule } from '../goals/goals.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TelegramModule } from '../channels/telegram/telegram.module'
import { BriefingService } from './briefing.service'
import { BriefingController } from './briefing.controller'
import { BriefingStore } from './briefing.store'
import { ConnectorsModule } from '../connectors/connectors.module'
import { WebSearchTool } from '../tools/connectors/web-search.tool'
import { PromptGuardService } from '../tools/prompt-guard.service'

@Module({
  imports: [PrismaModule, AgentModule, GoalsModule, NotificationsModule, TelegramModule, ConnectorsModule],
  // WebSearchTool/PromptGuardService are provided locally (no deps on ToolsModule) to avoid circular imports.
  providers: [BriefingService, BriefingStore, WebSearchTool, PromptGuardService],
  controllers: [BriefingController],
  exports: [BriefingService],
})
export class BriefingModule {}
