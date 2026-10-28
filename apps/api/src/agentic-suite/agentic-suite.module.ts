import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AgentModule } from '../agent/agent.module'
import { UsersModule } from '../users/users.module'
import { ToolsModule } from '../tools/tools.module'
import { AgenticSuiteController } from './agentic-suite.controller'
import { AgenticSuiteService } from './agentic-suite.service'

@Module({
  imports: [PrismaModule, AgentModule, UsersModule, ToolsModule],
  controllers: [AgenticSuiteController],
  providers: [AgenticSuiteService],
  exports: [AgenticSuiteService],
})
export class AgenticSuiteModule {}
