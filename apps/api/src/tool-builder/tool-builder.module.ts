import { Module } from '@nestjs/common'
import { ToolBuilderService } from './tool-builder.service'
import { ToolBuilderController } from './tool-builder.controller'
import { ToolsModule } from '../tools/tools.module'

@Module({
  imports: [ToolsModule],
  controllers: [ToolBuilderController],
  providers: [ToolBuilderService],
  exports: [ToolBuilderService],
})
export class ToolBuilderModule {}
