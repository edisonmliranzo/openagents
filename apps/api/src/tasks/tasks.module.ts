import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AgentModule } from '../agent/agent.module'
import { ToolsModule } from '../tools/tools.module'
import { TasksService } from './tasks.service'
import { TasksController } from './tasks.controller'

@Module({
  imports: [PrismaModule, AgentModule, ToolsModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
