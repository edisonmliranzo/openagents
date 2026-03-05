import { Module } from '@nestjs/common'
import { NanobotModule } from '../nanobot/nanobot.module'
import { ToolsModule } from '../tools/tools.module'
import { SkillRegistryController } from './skill-registry.controller'
import { SkillRegistryService } from './skill-registry.service'

@Module({
  imports: [NanobotModule, ToolsModule],
  controllers: [SkillRegistryController],
  providers: [SkillRegistryService],
  exports: [SkillRegistryService],
})
export class SkillRegistryModule {}
