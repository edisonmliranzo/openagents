import { Module } from '@nestjs/common'
import { DelegationService } from './delegation.service'
import { DelegationController } from './delegation.controller'
import { SubagentService } from './subagent.service'
import { AgentModule } from '../agent/agent.module'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [AgentModule, PrismaModule],
  providers: [DelegationService, SubagentService],
  controllers: [DelegationController],
  exports: [DelegationService, SubagentService],
})
export class DelegationModule {}
