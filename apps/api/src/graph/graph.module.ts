import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { PrismaModule } from '../prisma/prisma.module'
import { PrivacyModule } from '../privacy/privacy.module'
import { GraphController } from './graph.controller'
import { GraphService } from './graph.service'
import { GraphStore } from './graph.store'

@Module({
  imports: [PrismaModule, AgentModule, PrivacyModule],
  providers: [GraphService, GraphStore],
  controllers: [GraphController],
  exports: [GraphService],
})
export class GraphModule {}
