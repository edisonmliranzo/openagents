import { Module } from '@nestjs/common'
import { PermissionsController } from './permissions.controller'
import { ToolPermissionsService } from './tool-permissions.service'

/** Leaf module: no imports beyond the global Prisma/DocumentStore. */
@Module({
  controllers: [PermissionsController],
  providers: [ToolPermissionsService],
  exports: [ToolPermissionsService],
})
export class PermissionsModule {}
