import { Module } from '@nestjs/common'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { TeamWorkspaceController } from './team-workspace.controller'
import { TeamWorkspaceService } from './team-workspace.service'

@Module({
  imports: [WorkspacesModule],
  controllers: [TeamWorkspaceController],
  providers: [TeamWorkspaceService],
  exports: [TeamWorkspaceService],
})
export class TeamWorkspaceModule {}
