import { Module } from '@nestjs/common'
import { AgentService } from './agent.service'
import { AgentController } from './agent.controller'
import { LLMService } from './llm.service'
import { ToolsModule } from '../tools/tools.module'
import { MemoryModule } from '../memory/memory.module'
import { ApprovalsModule } from '../approvals/approvals.module'
import { UsersModule } from '../users/users.module'
import { AuditModule } from '../audit/audit.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [ToolsModule, MemoryModule, ApprovalsModule, UsersModule, AuditModule, NotificationsModule],
  controllers: [AgentController],
  providers: [AgentService, LLMService],
  exports: [AgentService, LLMService],
})
export class AgentModule {}
