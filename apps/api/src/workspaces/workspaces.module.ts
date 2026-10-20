import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { WorkflowsModule } from '../workflows/workflows.module'
import { WorkspacesController } from './workspaces.controller'
import { WorkspacesService } from './workspaces.service'
import { WorkspaceCollabService } from './workspace-collab.service'

@Module({
  imports: [PrismaModule, WorkflowsModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceCollabService],
  exports: [WorkspacesService, WorkspaceCollabService],
})
export class WorkspacesModule {}
