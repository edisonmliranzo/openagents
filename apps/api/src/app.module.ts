import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { ConversationsModule } from './conversations/conversations.module'
import { AgentModule } from './agent/agent.module'
import { ToolsModule } from './tools/tools.module'
import { ApprovalsModule } from './approvals/approvals.module'
import { MemoryModule } from './memory/memory.module'
import { SessionsModule } from './sessions/sessions.module'
import { UsersModule } from './users/users.module'
import { AuditModule } from './audit/audit.module'
import { NotificationsModule } from './notifications/notifications.module'
import { CronModule } from './cron/cron.module'
import { PrismaModule } from './prisma/prisma.module'
import { NanobotModule } from './nanobot/nanobot.module'
import { SystemModule } from './system/system.module'
import { LabsModule } from './labs/labs.module'
import { WhatsAppModule } from './channels/whatsapp/whatsapp.module'
import { PlatformModule } from './platform/platform.module'
import { HealthModule } from './health/health.module'
import { WorkflowsModule } from './workflows/workflows.module'
import { MissionControlModule } from './mission-control/mission-control.module'
import { PlaybooksModule } from './playbooks/playbooks.module'
import { AgentVersionsModule } from './agent-versions/agent-versions.module'
import { HandoffsModule } from './handoffs/handoffs.module'
import { SkillReputationModule } from './skill-reputation/skill-reputation.module'
import { DataLineageModule } from './lineage/lineage.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // BullModule disabled for local dev (requires Redis).
    // Enable when running with Docker: BullModule.forRoot({ redis: process.env.REDIS_URL })
    PrismaModule,
    MissionControlModule,
    DataLineageModule,
    HandoffsModule,
    SkillReputationModule,
    AuthModule,
    ConversationsModule,
    AgentModule,
    ToolsModule,
    ApprovalsModule,
    MemoryModule,
    SessionsModule,
    UsersModule,
    AuditModule,
    NotificationsModule,
    CronModule,
    NanobotModule,
    SystemModule,
    LabsModule,
    WhatsAppModule,
    PlatformModule,
    HealthModule,
    WorkflowsModule,
    PlaybooksModule,
    AgentVersionsModule,
  ],
})
export class AppModule {}
