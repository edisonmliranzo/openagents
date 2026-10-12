import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { TasksModule } from '../tasks/tasks.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AgentModule } from '../agent/agent.module'
import { ToolsModule } from '../tools/tools.module'
import { AutonomyController } from './autonomy.controller'
import { MissionsService } from './missions.service'
import { QuestionsService } from './questions.service'
import { UndoService } from './undo.service'
import { GraphService } from './graph.service'
import { HandoffService } from './handoff.service'

@Module({
  imports: [PrismaModule, TasksModule, NotificationsModule, AgentModule, ToolsModule],
  controllers: [AutonomyController],
  providers: [MissionsService, QuestionsService, UndoService, GraphService, HandoffService],
  exports: [MissionsService, QuestionsService, UndoService, GraphService],
})
export class AutonomyModule {}
