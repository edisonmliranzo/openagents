import { Module } from '@nestjs/common'
import { ToolBuilderService } from './tool-builder.service'
import { ToolBuilderController } from './tool-builder.controller'

@Module({
  providers: [ToolBuilderService],
  controllers: [ToolBuilderController],
  exports: [ToolBuilderService],
})
export class ToolBuilderModule {}
