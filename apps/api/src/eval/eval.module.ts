import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { UsersModule } from '../users/users.module'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AgentPresetsModule } from '../agent-presets/agent-presets.module'
import { AgentVersionsModule } from '../agent-versions/agent-versions.module'
import { EvalService } from './eval.service'
import { EvalController } from './eval.controller'
import { EvalSuitesService } from './eval-suites.service'
import { EvalSuitesController } from './eval-suites.controller'

@Module({
  imports: [PrismaModule, UsersModule, AgentModule, NotificationsModule, AgentPresetsModule, AgentVersionsModule],
  providers: [EvalService, EvalSuitesService],
  controllers: [EvalController, EvalSuitesController],
  exports: [EvalService, EvalSuitesService],
})
export class EvalModule {}
