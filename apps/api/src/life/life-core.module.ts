import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AgentModule } from '../agent/agent.module'
import { RulesService } from './rules.service'
import { ShadowService } from './shadow.service'

/**
 * Leaf module with the approval-rule and dry-run services so the task runtime
 * can consult them without a circular dependency on the full LifeModule.
 */
@Module({
  imports: [PrismaModule, AgentModule],
  providers: [RulesService, ShadowService],
  exports: [RulesService, ShadowService],
})
export class LifeCoreModule {}
