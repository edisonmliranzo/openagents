import { Module } from '@nestjs/common'
import { AgentService } from './agent.service'
import { AgentController } from './agent.controller'
import { LLMService } from './llm.service'
import { ParallelAgentService } from './parallel-agent.service'
import { ContextCompressorService } from './context-compressor.service'
import { ToolsModule } from '../tools/tools.module'
import { MemoryModule } from '../memory/memory.module'
import { ApprovalsModule } from '../approvals/approvals.module'
import { UsersModule } from '../users/users.module'
import { AuditModule } from '../audit/audit.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [ToolsModule, MemoryModule, ApprovalsModule, UsersModule, AuditModule, NotificationsModule, EventsModule],
  controllers: [AgentController],
  providers: [AgentService, LLMService, ParallelAgentService, ContextCompressorService],
  exports: [AgentService, LLMService, ParallelAgentService, ContextCompressorService],
})
export class AgentModule {}
