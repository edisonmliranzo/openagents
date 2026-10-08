import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { UsersModule } from '../users/users.module'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { EvalService } from './eval.service'
import { EvalController } from './eval.controller'

@Module({
  imports: [PrismaModule, UsersModule, AgentModule, NotificationsModule],
  providers: [EvalService],
  controllers: [EvalController],
  exports: [EvalService],
})
export class EvalModule {}
