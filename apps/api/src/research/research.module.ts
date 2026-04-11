import { Module } from '@nestjs/common'
import { ResearchController } from './research.controller'
import { ResearchService } from './research.service'
import { ApprovalsModule } from '../approvals/approvals.module'
import { PolicyModule } from '../policy/policy.module'
import { ToolsModule } from '../tools/tools.module'

@Module({
  imports: [ApprovalsModule, PolicyModule, ToolsModule],
  controllers: [ResearchController],
  providers: [ResearchService],
})
export class ResearchModule {}
