import { Module } from '@nestjs/common'
import { ResearchController } from './research.controller'
import { ResearchService } from './research.service'
import { DeepResearchService } from './deep-research.service'
import { ApprovalsModule } from '../approvals/approvals.module'
import { PolicyModule } from '../policy/policy.module'
import { ToolsModule } from '../tools/tools.module'
import { AgentModule } from '../agent/agent.module'
import { LibraryModule } from '../library/library.module'
import { ArtifactsModule } from '../artifacts/artifacts.module'

@Module({
  imports: [ApprovalsModule, PolicyModule, ToolsModule, AgentModule, LibraryModule, ArtifactsModule],
  controllers: [ResearchController],
  providers: [ResearchService, DeepResearchService],
})
export class ResearchModule {}
