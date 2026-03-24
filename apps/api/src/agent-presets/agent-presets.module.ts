import { Module } from '@nestjs/common'
import { NanobotModule } from '../nanobot/nanobot.module'
import { PrismaModule } from '../prisma/prisma.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { AgentPresetsController } from './agent-presets.controller'
import { AgentPresetsService } from './agent-presets.service'

@Module({
  imports: [PrismaModule, NanobotModule, WorkspacesModule],
  controllers: [AgentPresetsController],
  providers: [AgentPresetsService],
  exports: [AgentPresetsService],
})
export class AgentPresetsModule {}
