import { Module } from '@nestjs/common'
import { AgentService } from './agent.service'
import { AgentController } from './agent.controller'
import { LLMService } from './llm.service'
import { ParallelAgentService } from './parallel-agent.service'
import { ContextCompressorService } from './context-compressor.service'
import { ModelRouterService } from './model-router.service'
import { SentinelService } from './sentinel.service'
import { AnswerCacheService } from './answer-cache.service'
import { CriticService } from './critic.service'
import { PersonaService } from './persona.service'
import { ToolsModule } from '../tools/tools.module'
import { MemoryModule } from '../memory/memory.module'
import { ApprovalsModule } from '../approvals/approvals.module'
import { UsersModule } from '../users/users.module'
import { AuditModule } from '../audit/audit.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { EventsModule } from '../events/events.module'
import { GoalsModule } from '../goals/goals.module'

@Module({
  imports: [
    ToolsModule,
    MemoryModule,
    ApprovalsModule,
    UsersModule,
    AuditModule,
    NotificationsModule,
    EventsModule,
    GoalsModule,
  ],
  controllers: [AgentController],
  providers: [AgentService, LLMService, ParallelAgentService, ContextCompressorService, ModelRouterService, SentinelService, AnswerCacheService, CriticService, PersonaService],
  exports: [AgentService, LLMService, ParallelAgentService, ContextCompressorService, ModelRouterService, SentinelService, AnswerCacheService, CriticService, PersonaService],
})
export class AgentModule {}
