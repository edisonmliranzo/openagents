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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // BullModule disabled for local dev (requires Redis).
    // Enable when running with Docker: BullModule.forRoot({ redis: process.env.REDIS_URL })
    PrismaModule,
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
  ],
})
export class AppModule {}
