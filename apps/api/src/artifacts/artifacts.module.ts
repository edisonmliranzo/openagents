import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { ArtifactsController } from './artifacts.controller'
import { ArtifactsService } from './artifacts.service'

@Module({
  imports: [PrismaModule, WorkspacesModule],
  controllers: [ArtifactsController],
  providers: [ArtifactsService],
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
