import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ToolsModule } from '../tools/tools.module'
import { PluginsService } from './plugins.service'
import { PluginsController } from './plugins.controller'

@Module({
  imports: [PrismaModule, ToolsModule],
  providers: [PluginsService],
  controllers: [PluginsController],
  exports: [PluginsService],
})
export class PluginsModule {}
