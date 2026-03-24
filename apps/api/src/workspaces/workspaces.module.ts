import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { WorkflowsModule } from '../workflows/workflows.module'
import { WorkspacesController } from './workspaces.controller'
import { WorkspacesService } from './workspaces.service'

@Module({
  imports: [PrismaModule, WorkflowsModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
