import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { LibraryModule } from '../library/library.module'
import { PrismaModule } from '../prisma/prisma.module'
import { UsersModule } from '../users/users.module'
import { WebSearchTool } from '../tools/connectors/web-search.tool'
import { PromptGuardService } from '../tools/prompt-guard.service'
import { PublicAgentsController, PublicAgentsPublicController } from './public-agents.controller'
import { PublicAgentsService } from './public-agents.service'
import { PublicAgentsStore } from './public-agents.store'

@Module({
  imports: [PrismaModule, AgentModule, UsersModule, LibraryModule],
  // WebSearchTool/PromptGuardService provided locally (same pattern as BriefingModule) to avoid circular imports.
  providers: [PublicAgentsService, PublicAgentsStore, WebSearchTool, PromptGuardService],
  controllers: [PublicAgentsController, PublicAgentsPublicController],
  exports: [PublicAgentsService],
})
export class PublicAgentsModule {}
