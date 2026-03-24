import { Module } from '@nestjs/common'
import { AgentPresetsModule } from '../agent-presets/agent-presets.module'
import { ArtifactsModule } from '../artifacts/artifacts.module'
import { NanobotModule } from '../nanobot/nanobot.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ToolsModule } from '../tools/tools.module'
import { WorkflowsModule } from '../workflows/workflows.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { PacksController } from './packs.controller'
import { PacksService } from './packs.service'

@Module({
  imports: [
    PrismaModule,
    NanobotModule,
    ToolsModule,
    WorkflowsModule,
    WorkspacesModule,
    AgentPresetsModule,
    ArtifactsModule,
  ],
  controllers: [PacksController],
  providers: [PacksService],
  exports: [PacksService],
})
export class PacksModule {}
